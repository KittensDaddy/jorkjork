import TelegramBot from 'node-telegram-bot-api';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';

// Dynamically import node-fetch for downloading files
import('node-fetch').then(fetchModule => {
  const fetch = fetchModule.default;

  // Get current directory (fix for ES Modules)
  const __filename = new URL(import.meta.url).pathname;
  const __dirname = path.dirname(__filename);

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
  const ffmpegPath = '/app/node_modules/ffmpeg-ffprobe-static/ffmpeg';
  const ffprobePath = '/app/node_modules/ffmpeg-ffprobe-static/ffprobe';
  ffmpeg.setFfmpegPath(ffmpegPath);
  ffmpeg.setFfprobePath(ffprobePath);

  // Handle /start command
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Reply to a media message with /jorkthis');
  });

  // Handle media replies with /jorkthis
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    // Check if the message is a reply to a media message and contains the /jorkthis command
    if (msg.reply_to_message && msg.text && msg.text.startsWith('/jorkthis')) {
      // Check if the reply contains media
      if (msg.reply_to_message.photo || msg.reply_to_message.document || msg.reply_to_message.video || msg.reply_to_message.animation) {
        try {
          const fileId = msg.reply_to_message.photo?.[msg.reply_to_message.photo.length - 1]?.file_id || 
                        msg.reply_to_message.document?.file_id || 
                        msg.reply_to_message.video?.file_id || 
                        msg.reply_to_message.animation?.file_id;
          
          const fileLink = await bot.getFileLink(fileId);
          const inputFilePath = path.join(__dirname, 'input-media');
          const outputFilePath = path.join(__dirname, `output-${Date.now()}.gif`); // Force .gif output extension

          // Download the media file
          await downloadFile(fileLink, inputFilePath);

          // Combine with jorkin.gif using FFmpeg
          await combineWithJorkin(inputFilePath, jorkinPath, outputFilePath);

          // Check if the output file exceeds 30MB
          const outputFileSize = fs.statSync(outputFilePath).size;
          if (outputFileSize > 30 * 1024 * 1024) {
            throw new Error('Output file size exceeds the 30MB limit');
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
        bot.sendMessage(chatId, 'Please reply to a media with /jorkthis');
      }
    } else {
      bot.sendMessage(chatId, 'Please reply to a media with /jorkthis ');
    }
  });

  // Function to download a file from Telegram
  const downloadFile = async (url, dest) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);
    const fileStream = fs.createWriteStream(dest);
    await new Promise((resolve, reject) => {
      response.body.pipe(fileStream);
      response.body.on('error', reject);
      fileStream.on('finish', resolve);
    });
  };

const combineWithJorkin = (inputPath, jorkinPath, outputPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        console.error("Error in ffprobe:", err);
        reject('Error getting input media dimensions');
        return;
      }

      const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
      const inputWidth = videoStream?.width || 500;
      const inputHeight = videoStream?.height || 500;
      const inputDuration = metadata.format.duration || 0;

      console.log(`Input media dimensions: ${inputWidth}x${inputHeight}`);
      console.log(`Input media duration: ${inputDuration || 'N/A'} seconds`);

      const scaleFactor = Math.min(inputWidth, inputHeight) * 0.5;  // Scale GIF to 50% of the smallest video dimension
      const isAnimated = inputDuration > 0;

      const ffmpegCommand = ffmpeg(inputPath)
        .input(jorkinPath)
        .inputOptions(isAnimated ? [`-stream_loop -1`, `-t ${inputDuration}`] : [])
        .complexFilter([
			`[1:v]scale=${scaleFactor}:${scaleFactor},setsar=1[scaledJorkin];` + // Smooth FPS for GIF
			`[0:v][scaledJorkin]overlay=0:H-h,fps=60,scale=iw:ih:flags=lanczos` // Combine overlay and apply scaling and FPS
		])
		.save(outputPath)
		.outputOptions([
			'-r 60', // Ensure the output video frame rate is 30
			'-fs', '15M' // Limit file size to 15MB (optional, adjust as needed)
		])
        .on('end', () => {
          console.log('Media combined successfully');
          resolve();
        })
        .on('error', (err) => {
          console.error('Error processing media:', err);
          reject(err);
        });

      console.log(ffmpegCommand._getArguments().join(' '));  // Log the full ffmpeg command for debugging
    });
  });
}
});
