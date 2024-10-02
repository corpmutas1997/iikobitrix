const mongoose = require('mongoose');
const { Order } = require('./db');

// Подключение к MongoDB
mongoose.connect('mongodb://localhost:27017/ordersDB').then(async () => {
    try {
        const orders = await Order.find({});
        for (const order of orders) {
            if (order.lastOrderDate instanceof Date) {
                // Преобразуем дату в timestamp
                order.lastOrderDate = order.lastOrderDate.getTime();
                await order.save();
                console.log(`Обновлен заказ клиента ${order.customerName}: дата преобразована в timestamp.`);
            }
        }
        console.log('Все данные обновлены.');
        process.exit();
    } catch (error) {
        console.error('Ошибка при обновлении данных:', error);
        process.exit(1);
    }
});
