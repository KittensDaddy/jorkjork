const TelegramBot = require('node-telegram-bot-api');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

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

const ffmpegStaticPath = require.resolve('ffmpeg-ffprobe-static');
console.log('ffmpeg-ffprobe-static path:', ffmpegStaticPath);
console.log('FFmpeg Path:', ffmpegPath);
console.log('FFprobe Path:', ffprobePath);
console.log(require.resolve('ffmpeg-ffprobe-static'));


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

// Function to combine media with jorkin.gif, scaling jorkin.gif to 50% of the smaller dimension (width or height) of the input media
const combineWithJorkin = (inputPath, jorkinPath, outputPath) => {
  return new Promise((resolve, reject) => {
    // Use ffprobe to get the media dimensions and duration
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        console.error("Error in ffprobe:", err);  // Log the error
        reject('Error getting input media dimensions');
        return;
      }

      // Ensure the media contains valid dimensions and duration
      const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
      const duration = metadata.format.duration; // Get the input media's duration in seconds
      const isImage = !videoStream;  // Check if the media is an image (no video stream)

      if (!videoStream || !videoStream.width || !videoStream.height) {
        console.error("Invalid media dimensions");
        reject('Invalid media dimensions');
        return;
      }

      const inputWidth = videoStream.width;
      const inputHeight = videoStream.height;

      console.log(`Input media dimensions: ${inputWidth}x${inputHeight}, Duration: ${duration}s`);  // Log dimensions and duration

      // Calculate the scale factor based on the smaller dimension
      const scaleFactor = Math.min(inputWidth, inputHeight) * 0.5;

      // Prepare FFmpeg input options
      const inputOptions = [];
      if (duration && duration !== 'N/A' && !isImage) {
        inputOptions.push(`-t ${duration}`);  // Set the GIF duration to match the input media's duration
      }

      // Start the FFmpeg process
      ffmpeg(inputPath)
        .input(jorkinPath)
        .inputOptions(inputOptions)  // Only apply -t if duration is valid
        .complexFilter([
          // Loop the jorkin.gif for the entire duration of the input media (or indefinitely for images)
          `[1:v]loop=-1:size=1:start=0,scale=${scaleFactor}:${scaleFactor}[scaledJorkin];[0:v][scaledJorkin]overlay=0:H-h`
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
  });
};
