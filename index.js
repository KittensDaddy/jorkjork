const TelegramBot = require('node-telegram-bot-api');
const ffmpeg = require('fluent-ffmpeg');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Import ffmpeg-static for bundled ffmpeg binary
const ffmpegPath = '/app/node_modules/ffmpeg-ffprobe-static/ffmpeg';
const ffprobePath = '/app/node_modules/ffmpeg-ffprobe-static/ffprobe';

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

// Set FFmpeg and FFprobe binary paths for fluent-ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// Handle /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Welcome! Send me a media file (image, WebP, GIF, or video), and I will combine it with "jorkin.gif".');
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

      // Check if the file is a WebP and process accordingly
      const inputExtension = path.extname(inputFilePath).toLowerCase();
      if (inputExtension === '.webp') {
        // Check if the WebP is animated or static
        const isAnimated = await isWebPAnimated(inputFilePath);
        if (isAnimated) {
          // Process animated WebP with ffmpeg
          await combineWithJorkin(inputFilePath, jorkinPath, outputFilePath);
        } else {
          // Process static WebP with sharp
          await combineStaticWebPWithJorkin(inputFilePath, jorkinPath, outputFilePath);
        }
      } else {
        // Handle other media types (GIF, Video, etc.) with ffmpeg
        await combineWithJorkin(inputFilePath, jorkinPath, outputFilePath);
      }

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
    bot.sendMessage(chatId, 'Please send an image, WebP, GIF, or video file to combine with "jorkin.gif".');
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

// Function to determine if a WebP is animated (by checking frame count)
const isWebPAnimated = (filePath) => {
  return new Promise((resolve, reject) => {
    sharp(filePath)
      .metadata()
      .then(metadata => {
        // Animated WebP files have more than 1 frame
        resolve(metadata.pages > 1);
      })
      .catch(err => {
        reject(err);
      });
  });
};

// Function to combine static WebP with jorkin.gif
const combineStaticWebPWithJorkin = (inputPath, jorkinPath, outputPath) => {
  return sharp(inputPath)
    .resize(500)  // Resize the WebP to a fixed size (optional)
    .toBuffer()
    .then(buffer => {
      return new Promise((resolve, reject) => {
        ffmpeg()
          .input(jorkinPath)
          .input(buffer)
          .inputFormat('webp')
          .outputOptions(['-filter_complex', '[0:v][1:v]overlay=0:H-h', '-t 10'])
          .output(outputPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
    });
};

// Function to combine media with jorkin.gif using ffmpeg
const combineWithJorkin = (inputPath, jorkinPath, outputPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .input(jorkinPath)
      .inputOptions(['-stream_loop -1'])
      .complexFilter([
        `[1:v]scale=500:500[scaledJorkin];[0:v][scaledJorkin]overlay=0:H-h`
      ])
      .save(outputPath)
      .on('end', resolve)
      .on('error', reject);
  });
};
