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
  bot.sendMessage(chatId, 'Welcome! Send me a media file (image, WebP, GIF, or video) or a URL link, and I will combine it with "jorkin.gif".');
});

// Handle media messages and URLs
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  // If the message contains a URL (link)
  if (msg.text && isValidURL(msg.text)) {
    const url = msg.text;
    const inputFilePath = path.join(__dirname, 'input-media');
    const outputFilePath = path.join(__dirname, `output-${Date.now()}.gif`);

    try {
      // Download the file from the URL
      await downloadFile(url, inputFilePath);

      // Combine with jorkin.gif using FFmpeg
      await combineWithJorkin(inputFilePath, jorkinPath, outputFilePath);

      // Send the resulting file
      await bot.sendDocument(chatId, outputFilePath);

      // Cleanup temporary files
      fs.unlinkSync(inputFilePath);
      fs.unlinkSync(outputFilePath);
    } catch (err) {
      console.error('Error processing media from URL:', err);
      bot.sendMessage(chatId, 'An error occurred while processing your file. Please try again.');
    }
  } else if (msg.photo || msg.document || msg.video || msg.animation) {
    // If the message contains a photo, document (file), video, or animation
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
    bot.sendMessage(chatId, 'Please send an image, WebP, GIF, video file, or a valid URL to combine with "jorkin.gif".');
  }
});

// Function to download a file from a URL
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

// Function to check if a string is a valid URL
const isValidURL = (str) => {
  const pattern = /^(https?:\/\/)?([\w-]+(\.[\w-]+)+)(\/[\w-]+)*\/?(\?[\w=&]+)?$/;
  return pattern.test(str);
};

// Function to combine media with jorkin.gif, handling WebP (animated or static) and other formats
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
          // Scale the jorkin.gif and optionally adjust speed for static inputs
          `[1:v]scale=${scaleFactor}:${scaleFactor}${isAnimated ? '' : ',setpts=PTS/1.3'}[scaledJorkin];[0:v][scaledJorkin]overlay=0:H-h`
        ])
        .output(outputPath)
        .outputOptions(['-fs', '27M']) // Limit the file size to 27 MB
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

      ffmpegCommand.run();
    });
  });
};
