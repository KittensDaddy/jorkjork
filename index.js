import TelegramBot from 'node-telegram-bot-api';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';

// Dynamically import node-fetch for downloading files
import('node-fetch').then(fetchModule => {
  const fetch = fetchModule.default;

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

  // In-memory queue for handling requests
  const requestQueue = [];
  let isProcessing = false;

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
          // Add the request to the queue
          requestQueue.push({ chatId, msg });
          // If not already processing, start processing the queue
          if (!isProcessing) {
            processQueue();
          }
        } catch (err) {
          console.error('Error adding to queue:', err);
          bot.sendMessage(chatId, 'An error occurred while processing your request. Please try again.');
        }
      } else {
        bot.sendMessage(chatId, 'Please reply to a media with /jorkthis');
      }
    } else {
      bot.sendMessage(chatId, 'Please reply to a media with /jorkthis');
    }
  });

  // Function to process the queue
  const processQueue = async () => {
    if (requestQueue.length === 0) {
      isProcessing = false;
      return;
    }

    isProcessing = true;
    const { chatId, msg } = requestQueue.shift(); // Get the first request in the queue

    bot.sendMessage(chatId, 'Your request is being processed. Please wait...');

    try {
      const fileId = msg.reply_to_message.photo?.[msg.reply_to_message.photo.length - 1]?.file_id || 
                    msg.reply_to_message.document?.file_id || 
                    msg.reply_to_message.video?.file_id || 
                    msg.reply_to_message.animation?.file_id;
      
      const fileLink = await bot.getFileLink(fileId);
      const inputFilePath = path.join(__dirname, 'input-media');
      const outputFilePath = path.join(__dirname, `output-${Date.now()}.gif`);

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

    // Process the next request in the queue
    processQueue();
  };

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
        const inputFPS = videoStream?.r_frame_rate.split('/')[0] || 30;

        const scaleFactor = Math.min(inputWidth, inputHeight) * 0.5; // Scale GIF to 50% of the smallest video dimension
        const isAnimated = inputDuration > 0;

        // Max FPS limit is 144
        const maxFPS = 144;
        const targetFPS = Math.max(parseFloat(inputFPS), 30);  // Ensure FPS is at least 30

        const ffmpegCommand = ffmpeg(inputPath)
          .input(jorkinPath)
          .inputOptions(isAnimated ? [`-stream_loop -1`, `-t ${inputDuration}`] : [])
          .complexFilter([ 
            `[1:v]scale=${scaleFactor}:${scaleFactor},setsar=1[scaledJorkin];` +
            `[0:v]fps=${Math.min(targetFPS, maxFPS)}[fast];` +
            `[fast][scaledJorkin]overlay=0:H-h,fps=60,scale=iw:ih:flags=lanczos`
          ])
          .save(outputPath)
          .outputOptions([
            '-r 60', // Ensure the output video frame rate is 60
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
      });
    });
  };

});
