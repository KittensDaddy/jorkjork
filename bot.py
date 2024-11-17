import os
from telegram import Update, InputFile
from telegram.ext import Application, CommandHandler, MessageHandler, filters, CallbackContext
from moviepy.editor import VideoFileClip, vfx
import tempfile

TOKEN = os.getenv("BOT_TOKEN")
JORKIN_PATH = "jorkin.gif"

# Start command: Sends a welcome message
async def start(update: Update, context: CallbackContext):
    await update.message.reply_text("Send me media to combine with Jorkin!")

# Function to combine media with Jorkin GIF
def combine_media(input_path, output_path, speed=1.0):
    # Adjust Jorkin's speed
    jorkin_clip = VideoFileClip(JORKIN_PATH).resize(0.5).fx(vfx.speedx, speed)
    media_clip = VideoFileClip(input_path)
    combined = CompositeVideoClip([media_clip, jorkin_clip.set_position(('left', 'bottom'))])
    combined.write_videofile(output_path, codec="libx264")

# Handle the incoming media (video, photo, document)
async def handle_media(update: Update, context: CallbackContext):
    user = update.message.from_user
    file = update.message.video or update.message.document or update.message.photo[-1]
    file_id = file.file_id
    file_path = context.bot.get_file(file_id).file_path
    
    # Create temporary files
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as input_temp, \
         tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as output_temp:

        input_file = input_temp.name
        output_file = output_temp.name

        await context.bot.get_file(file_id).download(input_file)
        combine_media(input_file, output_file)

        # Send the output video
        await update.message.reply_video(video=InputFile(output_file))

        # Remove temporary files
        os.remove(input_file)
        os.remove(output_file)

# Change the speed of Jorkin GIF
async def change_speed(update: Update, context: CallbackContext):
    if len(context.args) == 1:
        speed = float(context.args[0])
        if 0.1 <= speed <= 3.0:
            context.user_data['speed'] = speed
            await update.message.reply_text(f"Speed set to {speed}x!")
        else:
            await update.message.reply_text("Please enter a value between 0.1 and 3.0")
    else:
        await update.message.reply_text("Usage: /speed <value>")

# Main function: Setup and start the bot
async def main():
    # Create the Application with the bot token
    application = Application.builder().token(TOKEN).build()

    # Add handlers for commands and messages
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("speed", change_speed))
    application.add_handler(MessageHandler(filters.Video | filters.Photo | filters.Document, handle_media))

    # Start polling for updates
    await application.run_polling()

if __name__ == "__main__":
    import asyncio
    # Run the bot asynchronously
    asyncio.run(main())
