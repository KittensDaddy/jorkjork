const TelegramBot = require('node-telegram-bot-api');

// Replace with your bot token
const token = process.env.TELEGRAM_TOKEN;

// Create a bot that uses polling to fetch new updates
const bot = new TelegramBot(token, { polling: true });

// Respond to /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Hello! I am your new bot. Try typing "hello"!');
});

// Respond to any other message
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text.toLowerCase();

  if (text === 'hello') {
    bot.sendMessage(chatId, 'Hello back! How can I help?');
  } else {
    bot.sendMessage(chatId, `You said: ${msg.text}`);
  }
});
