const TelegramBot = require('node-telegram-bot-api');
const ffmpeg = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');

// Bot token from BotFather
const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Path to the static jorkin.gif
const jorkinPath = path.join(__dirname, 'jorkin.gif');

// Ensure jorkin.gif exists
if (!fs.existsSync(jorkinPath)) {
  console.error('jorkin.gif not found! Please upload it to the project directory.');
  process.exit(1);
}

// Handle /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Welcome! Send me a media file (image, GIF, or video), and I will combine it with "jorkin.gif".');
});

// Handle media messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  // Check if the message contains media
  if (msg.photo || msg.document || msg.video || msg.animation) {
    try {
      // Download the file
      const fileId = msg.photo?.[msg.photo.length - 1]?.file_id || msg.document?.file_id || msg.video?.file_id || msg.animation?.file_id;
      const fileLink = await bot.getFileLink(fileId);
      const inputFilePath = path.join(__dirname, 'input-media');
      const outputFilePath = path.join(__dirname, `output-${Date.now()}.gif`);

      // Download the media file
      await downloadFile(fileLink, inputFilePath);

      // Combine with jorkin.gif using FFmpeg
      await combineWithJorkin(inputFilePath, jorkinPath, outputFilePath);

      // Send the resulting file
      await bot.sendDocument(chatId, outputFilePath);

      // Cleanup temporary files
      fs.unlinkSync(inputFilePath);
      fs.unlinkSync(outputFilePath);
    } catch (err) {
      console.error('Error processing media:', err);
      bot.sendMessage(chatId, 'An error occurred while processing your file. Please try again.');
    }
  } else {
    bot.sendMessage(chatId, 'Please send an image, GIF, or video file to combine with "jorkin.gif".');
  }
});

// Function to download a file from Telegram
const downloadFile = async (url, dest) => {
  const { default: fetch } = await import('node-fetch'); // Dynamically import node-fetch
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);
  const fileStream = fs.createWriteStream(dest);
  await new Promise((resolve, reject) => {
    response.body.pipe(fileStream);
    response.body.on('error', reject);
    fileStream.on('finish', resolve);
  });
};

// Function to combine media with jorkin.gif
const combineWithJorkin = (inputPath, jorkinPath, outputPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setFfmpegPath(ffmpegPath) // Use the static FFmpeg binary
      .input(jorkinPath)
      .complexFilter('[0:v][1:v] overlay=10:10')
      .save(outputPath)
      .on('end', resolve)
      .on('error', reject);
  });
};
