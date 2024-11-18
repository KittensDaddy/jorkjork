const TelegramBot = require('node-telegram-bot-api');
const ffmpeg = require('fluent-ffmpeg');
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

  // Check if the message contains media (image, GIF, WebP, video)
  if (msg.photo || msg.document || msg.video || msg.animation) {
    try {
      // Extract file info
      const fileId = msg.photo?.[msg.photo.length - 1]?.file_id || msg.document?.file_id || msg.video?.file_id || msg.animation?.file_id;
      const fileLink = await bot.getFileLink(fileId);

      // Validate the file type (image, video, GIF, WebP)
      const fileMimeType = msg.photo ? msg.photo[0].mime_type : msg.document?.mime_type || msg.video?.mime_type || msg.animation?.mime_type;
      const validFileTypes = [
        'image/jpeg',    // For .jpg and .jpeg
        'image/png',     // For PNG
        'image/webp',    // For WebP
        'video/mp4',     // For MP4 videos
        'video/avi',     // For AVI videos
        'image/gif'      // For GIF
      ];

      if (!validFileTypes.includes(fileMimeType)) {
        bot.sendMessage(chatId, 'Invalid file type. Please send an image, WebP, GIF, or video file.');
        return;
      }

      const inputFilePath = path.join(__dirname, 'input-media');
      const outputFilePath = path.join(__dirname, `output-${Date.now()}.gif`);

      // Download the media file
      await downloadFile(fileLink, inputFilePath);

      // Combine with jorkin.gif using FFmpeg
      await combineWithJorkin(inputFilePath, jorkinPath, outputFilePath);

      // Send the resulting GIF file to Telegram
      await bot.sendDocument(chatId, outputFilePath);

      // Cleanup temporary files after upload
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

// Function to combine media with jorkin.gif
const combineWithJorkin = (inputPath, jorkinPath, outputPath) => {
  return new Promise((resolve, reject) => {
    // Use ffprobe to get the media dimensions and determine if WebP is animated or static
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        console.error("Error in ffprobe:", err);  // Log the error
        reject('Error getting input media dimensions');
        return;
      }

      // Get the video stream for dimensions and frame count
      const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
      const inputWidth = videoStream?.width || 500; // Default width for static WebP
      const inputHeight = videoStream?.height || 500; // Default height for static WebP
      const frameCount = videoStream?.nb_frames || 1; // `nb_frames` is undefined for static images
      const inputDuration = metadata.format.duration || 0; // Duration is undefined for static images

      console.log(`Input media dimensions: ${inputWidth}x${inputHeight}`);  // Log dimensions
      console.log(`Input media duration: ${inputDuration || 'N/A'} seconds`);  // Log duration
      console.log(`Input media frame count: ${frameCount}`);  // Log frame count

      // Calculate the scale factor based on the smaller dimension
      const scaleFactor = Math.min(inputWidth, inputHeight) * 0.5;

      // Determine if the input is animated (either duration > 0 or frame count > 1)
      const isAnimated = inputDuration > 0 || frameCount > 1;
      console.log(`Is input animated? ${isAnimated}`);  // Log animation check

      // Create FFmpeg command
      const ffmpegCommand = ffmpeg(inputPath)
        .input(jorkinPath)
        .inputOptions(
          isAnimated
            ? [`-stream_loop -1`, `-t ${inputDuration}`] // Loop jorkin.gif to match input duration if animated
            : [] // Static input
        )
        .complexFilter([ 
          `[1:v]scale=${scaleFactor}:${scaleFactor}${isAnimated ? '' : ',setpts=PTS/1.3'}[scaledJorkin];[0:v][scaledJorkin]overlay=0:H-h`
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

      // Log the FFmpeg command for debugging
      console.log(ffmpegCommand._getArguments().join(' '));
    });
  });
};
