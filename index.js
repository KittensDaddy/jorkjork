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
          // Apply the loop filter if the input media is a video
          `[1:v]loop=0:size=99999999:start=0,scale=${scaleFactor}:${scaleFactor}[scaledJorkin];[0:v][scaledJorkin]overlay=0:H-h`
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
