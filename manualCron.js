const mongoose = require('mongoose');
const { Order, sendToLostCustomerProcess } = require('./startserver');

// Подключение к базе данных
mongoose.connect('mongodb://localhost:27017/ordersDB').then(async () => {
    const twentyOneDaysAgo = new Date();
    twentyOneDaysAgo.setDate(twentyOneDaysAgo.getDate() - 21);

    try {
        console.log("Запуск ручной проверки потерянных клиентов...");
        const lostOrders = await Order.find({ lastOrderDate: { $lt: twentyOneDaysAgo }, isLost: false });
        lostOrders.forEach(async (order) => {
            console.log(`Отправка клиента ${order.customerName} в смарт-процесс...`);
            await sendToLostCustomerProcess(order);
            order.isLost = true;
            await order.save();
            console.log(`Клиент ${order.customerName} помечен как потерянный.`);
        });
        console.log("Ручная проверка завершена.");
        process.exit(); // Завершение работы скрипта
    } catch (error) {
        console.error('Ошибка при ручной проверке потерянных клиентов:', error);
        process.exit(1);
    }
});
