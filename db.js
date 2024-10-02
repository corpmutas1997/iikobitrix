const mongoose = require('mongoose');

// Подключение к MongoDB
mongoose.connect('mongodb://localhost:27017/ordersDB', );

// Схема для заказов
const orderSchema = new mongoose.Schema({
    customerId: String,
    customerName: String,
    phone: String,
    lastOrderDate: Date,
    isLost: { type: Boolean, default: false }
});

// Модель заказа
const Order = mongoose.model('Order', orderSchema);

// Экспорт модели и подключения
module.exports = { Order };
