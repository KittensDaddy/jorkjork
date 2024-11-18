const TelegramBot = require('node-telegram-bot-api');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const execa = require('execa');

// Import ffmpeg-static for bundled ffmpeg binary
const ffmpegPath = '/app/node_modules/ffmpeg-ffprobe-static/ffmpeg';  // Adjust the path according to your environment
const ffprobePath = '/app/node_modules/ffmpeg-ffprobe-static/ffprobe';  // Adjust the path according to your environment

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

      // Preprocess and combine with jorkin.gif
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

// Function to preprocess WebP files
async function preprocessWebP(inputPath) {
  const outputDir = path.dirname(inputPath);
  const outputStatic = path.join(outputDir, 'output-static.png');
  const outputAnimated = path.join(outputDir, 'output-animated.mp4');

  try {
    // Check if the file is animated or static
    const isAnimated = await checkIfAnimatedWebP(inputPath);

    if (isAnimated) {
      // Convert animated WebP to MP4
      await execa('dwebp', ['-m', '4', '-o', outputAnimated, inputPath]);
      console.log(`Animated WebP converted to MP4: ${outputAnimated}`);
      return { path: outputAnimated, type: 'video' };
    } else {
      // Convert static WebP to PNG
      await sharp(inputPath).toFile(outputStatic);
      console.log(`Static WebP converted to PNG: ${outputStatic}`);
      return { path: outputStatic, type: 'image' };
    }
  } catch (error) {
    console.error('Error processing WebP file:', error);
    throw error;
  }
}

// Helper function to check if WebP is animated
async function checkIfAnimatedWebP(inputPath) {
  const { stdout } = await execa('dwebp', ['-info', inputPath]);
  return stdout.includes('Canvas Duration');
}

// Function to combine media with jorkin.gif, scaling jorkin.gif to 50% of the smaller dimension (width or height) of the input media
const combineWithJorkin = async (inputPath, jorkinPath, outputPath) => {
  const { path: processedPath, type } = await preprocessWebP(inputPath);

  return new Promise((resolve, reject) => {
    const scaleFactor = 250; // Example scale factor for demonstration

    const ffmpegCommand = ffmpeg(processedPath)
      .input(jorkinPath)
      .inputOptions(type === 'video' ? ['-stream_loop -1'] : [])
      .complexFilter([
        `[1:v]scale=${scaleFactor}:${scaleFactor}[scaledJorkin];[0:v][scaledJorkin]overlay=0:H-h`
      ])
      .save(outputPath)
      .on('end', () => {
        console.log('Media combined successfully');
        resolve();
      })
      .on('error', (err) => {
        console.error('Error processing media:', err);
        reject(err);
      });
  });
};
