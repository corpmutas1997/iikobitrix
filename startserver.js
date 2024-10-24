const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const mongoose = require('mongoose');
const cron = require('node-cron');
const app = express();

// Битрикс24 URL для создания сделки, контакта и смарт-процесса
const bitrix24WebhookUrl = 'https://b24-tej813.bitrix24.kz/rest/1/p2vjnb69pq6uavl2/crm.deal.add';
const bitrix24ContactUrl = 'https://b24-tej813.bitrix24.kz/rest/1/p2vjnb69pq6uavl2/crm.contact.add';

// Подключение к MongoDB (убраны устаревшие опции)
mongoose.connect('mongodb://localhost:27017/ordersDB');

// Схема для заказов, с хранением даты в виде timestamp
const orderSchema = new mongoose.Schema({
    customerId: String,
    customerName: String,
    phone: String,
    lastOrderDate: Number,  // Храним дату как timestamp
    isLost: { type: Boolean, default: false }
});

const Order = mongoose.model('Order', orderSchema);

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
        const customerId = hookData[0]?.eventInfo?.order?.customer?.id || 'Unknown';

        // Сохраняем заказ в MongoDB или обновляем последний заказ клиента
        let order = await Order.findOne({ customerId });

        if (order) {
            // Обновляем дату последнего заказа
            order.lastOrderDate = Date.now();  // Используем текущий timestamp
            order.isLost = false;  // Сбрасываем статус потерянного клиента
        } else {
            // Создаем новый заказ
            order = new Order({
                customerId,
                customerName,
                phone,
                lastOrderDate: Date.now()  // Устанавливаем текущий timestamp
            });
        }

        await order.save();

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

            // Проверяем время опоздания и создаем либо сделку с пометкой о задержке
            if (deliveryDelay > 0) {
                console.log(`Доставка опоздала на ${deliveryDelay} минут относительно ожидаемого времени.`);

                // Данные для создания сделки (если доставка опоздала)
                const dealData = {
                    fields: {
                        TITLE: `Опоздавший заказ №${orderId} от ${customerName}`,
                        STAGE_ID: 'NEW',  // Стадия сделки
                        OPENED: 'Y',  // Сделка открыта
                        ASSIGNED_BY_ID: 1,  // Ответственный менеджер
                        CURRENCY_ID: 'KZT',  // Указываем валюту тенге
                        OPPORTUNITY: totalAmount,  // Сумма сделки
                        COMMENTS: `Заказ от клиента: ${customerName}, Телефон: ${phone}, Доставка опоздала на ${deliveryDelay.toFixed(2)} минут`,  // Добавляем комментарий о задержке
                        CONTACT_ID: contactId  // Привязываем сделку к контакту
                    }
                };

                // Создаем сделку в Bitrix24
                const dealResponse = await fetch(bitrix24WebhookUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(dealData),
                });

                const dealResult = await dealResponse.json();
                console.log('Ответ Битрикс24 (Сделка - Опоздавшая доставка):', dealResult);

                if (dealResult.error) {
                    console.error('Ошибка при создании сделки для опоздавшей доставки:', dealResult.error);
                    return res.status(500).json({ error: 'Ошибка создания сделки в Битрикс для опоздавшей доставки' });
                }

                res.status(200).json({ message: 'Создана сделка для опоздавшей доставки' });
            } else {
                console.log('Доставка в срок. Будет создана обычная сделка.');

                // Данные для создания обычной сделки
                const dealData = {
                    fields: {
                        TITLE: `Заказ №${orderId} от ${customerName}`,
                        STAGE_ID: 'NEW',
                        OPENED: 'Y',
                        ASSIGNED_BY_ID: 1,
                        CURRENCY_ID: 'KZT',
                        OPPORTUNITY: totalAmount,
                        COMMENTS: `Заказ от клиента: ${customerName}, Телефон: ${phone}`,
                        CONTACT_ID: contactId
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

// Функция для отправки потерянного клиента в смарт-процесс для потерянных клиентов
async function sendToLostCustomerProcess(order) {
    const smartProcessData = {
        entityTypeId: lostCustomerProcessEntityTypeId, // Смарт-процесс для потерянных клиентов
        fields: {
            TITLE: `Потерянный клиент ${order.customerName}`,
            CONTACT_ID: order.customerId,
            COMMENTS: `Клиент не заказывал более 21 дня.`
        }
    };

    try {
        const response = await fetch(bitrix24SmartProcessUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(smartProcessData),
        });
        const result = await response.json();
        console.log('Ответ Битрикс24 (Потерянный клиент - Смарт-процесс):', result);
    } catch (error) {
        console.error('Ошибка при отправке в смарт-процесс потерянного клиента:', error);
    }
}

// Планировщик для проверки неактивных клиентов
cron.schedule('0 0 * * *', async () => {
    const twentyOneDaysAgo = Date.now() - (21 * 24 * 60 * 60 * 1000);  // 21 день назад в миллисекундах

    try {
        const lostOrders = await Order.find({ lastOrderDate: { $lt: twentyOneDaysAgo }, isLost: false });
        lostOrders.forEach(async (order) => {
            await sendToLostCustomerProcess(order);
            order.isLost = true;
            await order.save();
        });
    } catch (error) {
        console.error('Ошибка при проверке потерянных клиентов:', error);
    }
});

// Запуск сервера на порте 3000
app.listen(3000, () => {
    console.log('Сервер запущен на порте 3000 и ожидает вебхуки на /webhook');
});
