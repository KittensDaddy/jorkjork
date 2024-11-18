import os
import requests
from moviepy.editor import VideoFileClip, concatenate_videoclips, ImageClip
from PIL import Image
from flask import Flask, request
from telegram import Bot
from telegram.ext import Dispatcher, CommandHandler, MessageHandler, Filters

# Environment variables
TOKEN = os.getenv('TOKEN')  # Your Telegram bot token from Railway environment variables
WEBHOOK_URL = os.getenv('WEBHOOK_URL')  # Public URL from Railway

# Initialize Flask app and bot
app = Flask(__name__)
bot = Bot(token=TOKEN)
dispatcher = Dispatcher(bot, update_queue=None, workers=0)

# Path to overlay GIF (jorkin.gif)
JORKIN_GIF_PATH = "jorkin.gif"

@app.route(f'/{TOKEN}', methods=['POST'])
def webhook():
    """Telegram webhook handler."""
    update = request.get_json()
    dispatcher.process_update(update)
    return 'OK', 200

def start(update, context):
    """Start command handler."""
    update.message.reply_text("Send me a video, GIF, or image to overlay with jorkin.gif!")

def handle_media(update, context):
    """Handle incoming media (image, video, or gif)."""
    file = update.message.video or update.message.document or update.message.photo
    if file:
        file_id = file[-1].file_id if isinstance(file, list) else file.file_id
        file_path = context.bot.get_file(file_id).file_path
        file_extension = file_path.split('.')[-1]

        # Download the media file
        response = requests.get(file_path)
        file_name = f'user_media.{file_extension}'
        with open(file_name, 'wb') as f:
            f.write(response.content)

        # Process the media (apply jorkin.gif overlay)
        processed_gif = process_media(file_name)
        if processed_gif:
            update.message.reply_document(document=open(processed_gif, 'rb'))
            os.remove(file_name)  # Clean up the original file
            os.remove(processed_gif)  # Clean up the processed file

def adjust_speed(media_clip, speed_factor):
    """Adjust the speed of jorkin.gif."""
    return media_clip.fx('speedx', speed_factor)

def process_media(media_file):
    """Process the media file and apply jorkin.gif overlay."""
    media_extension = media_file.split('.')[-1]
    
    # Load the overlay GIF
    overlay = ImageClip(JORKIN_GIF_PATH).set_duration(10).resize(height=100)

    if media_extension in ['mp4', 'gif']:
        # Process video or GIF
        media_clip = VideoFileClip(media_file)
        media_clip = media_clip.subclip(0, min(10, media_clip.duration))  # Clip the video to 10s max

        # Add the overlay GIF
        overlay = overlay.set_position(('left', 'bottom'))
        final_clip = concatenate_videoclips([media_clip, overlay.set_duration(media_clip.duration)])

        output_file = 'combined_output.gif'
        final_clip.write_gif(output_file)
        return output_file
    elif media_extension in ['jpg', 'jpeg', 'png']:
        # Process image
        image = Image.open(media_file)
        overlay_resized = overlay.resize(image.size).convert('RGBA')
        final_image = Image.alpha_composite(image.convert('RGBA'), overlay_resized)

        output_file = 'combined_output.gif'
        final_image.save(output_file)
        return output_file

    return None

def main():
    """Main entry point for the bot."""
    # Add handlers
    dispatcher.add_handler(CommandHandler("start", start))
    dispatcher.add_handler(MessageHandler(Filters.photo | Filters.video | Filters.document, handle_media))
    
    # Set webhook
    bot.set_webhook(url=WEBHOOK_URL)

if __name__ == '__main__':
    main()
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
