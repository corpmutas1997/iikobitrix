const fetch = require('node-fetch');

// URL вашего сервера для тестирования вебхука
const webhookUrl = 'http://localhost:3000/webhook'; // Замените на нужный URL, если сервер на другом порте

// Тестовые данные для отправки вебхука
const testWebhookData = [
  {
    eventInfo: {
      order: {
        status: 'closed',
        id: '12345',
        customer: {
          name: 'Иван Иванов',
        },
        phone: '+77001234567',
        sum: 10000,
        completeBefore: '2024-09-30 18:00:00', // Ожидаемое время доставки (предзаказ)
        whenConfirmed: '2024-09-30 14:00:00', // Время подтверждения заказа
        whenPrinted: '2024-09-30 16:00:00', // Время печати заказа
        whenDelivered: '2024-09-30 18:00:00', // Фактическое время доставки (опоздала на 30 минут)
      },
    },
  },
];

// Функция для отправки тестового вебхука
async function sendTestWebhook() {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testWebhookData),
    });

    const data = await response.json();
    console.log('Ответ сервера:', data);
  } catch (error) {
    console.error('Ошибка отправки вебхука:', error);
  }
}

// Запуск функции
sendTestWebhook();
