const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const app = express();

// Битрикс24 URL для создания сделки, контакта и смарт-процесса
const bitrix24WebhookUrl = 'https://b24-tej813.bitrix24.kz/rest/1/p2vjnb69pq6uavl2/crm.deal.add';
const bitrix24SmartProcessUrl = 'https://b24-tej813.bitrix24.kz/rest/1/p2vjnb69pq6uavl2/crm.item.add'; // URL для смарт-процесса
const bitrix24ContactUrl = 'https://b24-tej813.bitrix24.kz/rest/1/p2vjnb69pq6uavl2/crm.contact.add';

// ID смарт-процесса
const smartProcessEntityTypeId = 1036 ; // Укажите правильный ID вашего смарт-процесса

// Middleware для обработки JSON данных в теле запроса
app.use(bodyParser.json());

// Эндпоинт для приема вебхуков
app.post('/webhook', async (req, res) => {
    const hookData = req.body; // Данные вебхука

    console.log('Получены данные вебхука:', JSON.stringify(hookData, null, 2));

    const orderStatus = hookData[0]?.eventInfo?.order?.status?.trim().toLowerCase();
    const completeBefore = new Date(hookData[0]?.eventInfo?.order?.completeBefore);
    const whenDelivered = new Date(hookData[0]?.eventInfo?.order?.whenDelivered);

    const deliveryDelay = (whenDelivered - completeBefore) / (1000 * 60); // Разница в минутах

    // Проверяем, имеет ли заказ статус Closed
    if (orderStatus === 'closed') {
        const orderId = hookData[0]?.eventInfo?.id || 'Неизвестный заказ';
        const customerName = hookData[0]?.eventInfo?.order?.customer?.name || 'Неизвестный клиент';
        const phone = hookData[0]?.eventInfo?.order?.phone || 'Телефон не указан';
        const totalAmount = hookData[0]?.eventInfo?.order?.sum || 0;

        // Создаем контакт в Битрикс24 для клиента
        const contactData = {
            fields: {
                NAME: customerName,
                PHONE: [{ VALUE: phone, VALUE_TYPE: 'WORK' }]
            }
        };

        try {
            // Сначала создаем контакт
            const contactResponse = await fetch(bitrix24ContactUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(contactData),
            });

            const contactResult = await contactResponse.json();
            console.log('Ответ Битрикс24 (Контакт):', contactResult);

            if (contactResult.error) {
                console.error('Ошибка при создании контакта:', contactResult.error);
                return res.status(500).json({ error: 'Ошибка создания контакта в Битрикс' });
            }

            const contactId = contactResult.result; // Идентификатор созданного контакта

            // Проверяем время опоздания и создаем либо смарт-процесс, либо обычную сделку
            if (deliveryDelay > 0) {
                console.log(`Доставка опоздала на ${deliveryDelay} минут относительно ожидаемого времени.`);

                // Данные для создания элемента в смарт-процессе (если доставка опоздала)
                const smartProcessData = {
                    entityTypeId: smartProcessEntityTypeId, // Используем отдельную переменную для ID смарт-процесса
                    fields: {
                        TITLE: `Опоздавший заказ №${orderId} от ${customerName}`,
                        OPPORTUNITY: totalAmount, // Сумма заказа
                        CONTACT_ID: contactId, // Привязываем к контакту
                        COMMENTS: `Заказ от клиента: ${customerName}, Телефон: ${phone}, Доставка опоздала на ${deliveryDelay.toFixed(2)} минут`
                    }
                };

                // Создаем элемент смарт-процесса
                const smartProcessResponse = await fetch(bitrix24SmartProcessUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(smartProcessData),
                });

                const smartProcessResult = await smartProcessResponse.json();
                console.log('Ответ Битрикс24 (Смарт-процесс):', smartProcessResult);

                if (smartProcessResult.error) {
                    console.error('Ошибка при создании элемента в смарт-процессе:', smartProcessResult.error);
                    return res.status(500).json({ error: 'Ошибка создания элемента смарт-процесса в Битрикс' });
                }

                res.status(200).json({ message: 'Доставка опоздала, создан элемент в смарт-процессе' });
            } else {
                console.log('Доставка в срок. Будет создана обычная сделка.');

                // Данные для создания сделки (если доставка не опоздала)
                const dealData = {
                    fields: {
                        TITLE: `Заказ №${orderId} от ${customerName}`,
                        STAGE_ID: 'NEW',
                        OPENED: 'Y',
                        ASSIGNED_BY_ID: 1, // Ответственный менеджер
                        CURRENCY_ID: 'KZT', // Указываем валюту тенге
                        OPPORTUNITY: totalAmount, // Сумма сделки
                        COMMENTS: `Заказ от клиента: ${customerName}, Телефон: ${phone}`,
                        CONTACT_ID: contactId // Привязываем сделку к контакту
                    }
                };

                // Создаем сделку
                const dealResponse = await fetch(bitrix24WebhookUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(dealData),
                });

                const dealResult = await dealResponse.json();
                console.log('Ответ Битрикс24 (Сделка):', dealResult);

                if (dealResult.error) {
                    console.error('Ошибка при создании сделки:', dealResult.error);
                    return res.status(500).json({ error: 'Ошибка создания сделки в Битрикс' });
                }

                res.status(200).json({ message: 'Создана сделка, доставка в срок' });
            }
        } catch (error) {
            console.error('Ошибка при создании контакта или сделки в Битрикс24:', error);
            res.status(500).json({ error: 'Ошибка при обработке вебхука' });
        }
    } else {
        res.status(200).send('Webhook получен, но статус не Closed');
    }
});

// Запуск сервера на порте 3000
app.listen(3000, () => {
    console.log('Сервер запущен на порте 3000 и ожидает вебхуки на /webhook');
});