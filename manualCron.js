const mongoose = require('mongoose');
const fetch = require('node-fetch');
const { Order } = require('./db');

// URL для Bitrix24 смарт-процесса
const bitrix24SmartProcessUrl = 'https://b24-tej813.bitrix24.kz/rest/1/p2vjnb69pq6uavl2/crm.item.add'; 
const lostCustomerProcessEntityTypeId = 1046;  // Замени на правильный ID смарт-процесса для потерянных клиентов

// Функция для отправки потерянного клиента в смарт-процесс для потерянных клиентов
async function sendToLostCustomerProcess(order) {
    console.log(`Отправка потерянного клиента ${order.customerName} в Bitrix24...`);

    const smartProcessData = {
        entityTypeId: lostCustomerProcessEntityTypeId,
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
        console.log('Ответ от Bitrix24 (Потерянный клиент):', result);

        if (result.error) {
            console.error('Ошибка при отправке в Bitrix24:', result.error);
        }
    } catch (error) {
        console.error('Ошибка при отправке запроса в Bitrix24:', error);
    }
}

// Подключение к базе данных и запуск проверки потерянных клиентов
(async function runManualCron() {
    try {
        // Подключение к MongoDB
        await mongoose.connect('mongodb://localhost:27017/ordersDB');
        console.log("Подключение к базе данных установлено.");

        // Устанавливаем timestamp для 21 дня назад
        const twentyOneDaysAgo = new Date().getTime() - (21 * 24 * 60 * 60 * 1000); // 21 день в миллисекундах

        console.log(`Таймстамп для проверки потерянных клиентов: ${twentyOneDaysAgo}`);

        // Находим клиентов, которые не делали заказ более 21 дня назад и не помечены как потерянные
        const lostOrders = await Order.find({
            lastOrderDate: { $lt: twentyOneDaysAgo },
            isLost: false
        });

        console.log(`Найдено потерянных клиентов: ${lostOrders.length}`);

        if (lostOrders.length === 0) {
            console.log("Нет потерянных клиентов для отправки.");
        } else {
            for (const order of lostOrders) {
                console.log(`Отправка клиента ${order.customerName} в смарт-процесс...`);
                await sendToLostCustomerProcess(order);
                order.isLost = true;
                await order.save();
                console.log(`Клиент ${order.customerName} помечен как потерянный и обновлен в базе данных.`);
            }
        }

        console.log("Ручная проверка завершена.");
        process.exit();  // Завершение работы скрипта
    } catch (error) {
        console.error('Ошибка при ручной проверке потерянных клиентов:', error);
        process.exit(1);  // Завершение работы с ошибкой
    }
})();
