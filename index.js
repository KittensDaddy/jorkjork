// Function to combine media with jorkin.gif, scaling jorkin.gif to 50% of the smaller dimension (width or height) of the input media
const combineWithJorkin = (inputPath, jorkinPath, outputPath) => {
  return new Promise((resolve, reject) => {
    // Use ffprobe to get the media dimensions
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        console.error("Error in ffprobe:", err);  // Log the error
        reject('Error getting input media dimensions');
        return;
      }

      // Ensure the media contains valid dimensions
      const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
      if (!videoStream || !videoStream.width || !videoStream.height) {
        console.error("Invalid media dimensions");
        reject('Invalid media dimensions');
        return;
      }

      const inputWidth = videoStream.width;
      const inputHeight = videoStream.height;

      console.log(`Input media dimensions: ${inputWidth}x${inputHeight}`);  // Log dimensions

      // Calculate the scale factor based on the smaller dimension
      const scaleFactor = Math.min(inputWidth, inputHeight) * 0.5;

      // Calculate the bottom-left corner position
      const xPosition = 0; // 10px from the left
      const yPosition = inputHeight - scaleFactor; // 10px from the bottom

      // Get the duration of the input media
      const inputDuration = metadata.format.duration;
      
      // Start the FFmpeg process
      ffmpeg(inputPath)
        .input(jorkinPath)
        .inputOptions([
          `-t ${inputDuration}`,  // Set the duration of the overlay to match the input media
        ])
        .complexFilter([
          // Scale the jorkin.gif and overlay it on the input media, looping it
          `[1:v]scale=${scaleFactor}:${scaleFactor}[scaledJorkin];[0:v][scaledJorkin]overlay=${xPosition}:${yPosition}:enable='between(t,0,${inputDuration})'`
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
