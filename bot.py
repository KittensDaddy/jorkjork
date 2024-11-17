import os
from telegram import Update, InputFile
from telegram.ext import Updater, CommandHandler, MessageHandler, filters, CallbackContext
from moviepy.editor import VideoFileClip, concatenate_videoclips, CompositeVideoClip
import ffmpeg

TOKEN = os.getenv("BOT_TOKEN")
JORKIN_PATH = "jorkin.gif"

def start(update: Update, context: CallbackContext):
    update.message.reply_text("Send me media to combine with Jorkin!")

def combine_media(input_path, output_path, speed=1.0):
    # Adjust jorkin.gif speed
    jorkin_clip = VideoFileClip(JORKIN_PATH).resize(0.5).fx(vfx.speedx, speed)
    media_clip = VideoFileClip(input_path)
    combined = CompositeVideoClip([media_clip, jorkin_clip.set_position(('left', 'bottom'))])
    combined.write_videofile(output_path, codec="libx264")

def handle_media(update: Update, context: CallbackContext):
    user = update.message.from_user
    file = update.message.video or update.message.document or update.message.photo[-1]
    file_id = file.file_id
    file_path = context.bot.get_file(file_id).file_path
    
    input_file = f"{user.id}_input.mp4"
    output_file = f"{user.id}_output.mp4"

    context.bot.get_file(file_id).download(input_file)
    combine_media(input_file, output_file)

    update.message.reply_video(video=InputFile(output_file))

    os.remove(input_file)
    os.remove(output_file)

def change_speed(update: Update, context: CallbackContext):
    if len(context.args) == 1:
        speed = float(context.args[0])
        if 0.1 <= speed <= 3.0:
            context.user_data['speed'] = speed
            update.message.reply_text(f"Speed set to {speed}x!")
        else:
            update.message.reply_text("Please enter a value between 0.1 and 3.0")
    else:
        update.message.reply_text("Usage: /speed <value>")

def main():
    updater = Updater(TOKEN)
    dp = updater.dispatcher
    
    dp.add_handler(CommandHandler("start", start))
    dp.add_handler(CommandHandler("speed", change_speed))
    dp.add_handler(MessageHandler(filters.video | filters.photo | filters.document, handle_media))

    updater.start_polling()
    updater.idle()

if __name__ == "__main__":
    main()
