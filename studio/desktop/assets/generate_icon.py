from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
base=Path(__file__).resolve().parent
size=1024
img=Image.new("RGBA",(size,size),(0,0,0,0))
dr=ImageDraw.Draw(img)
dr.rounded_rectangle((42,42,982,982),radius=230,fill="#111b27")
dr.rounded_rectangle((65,65,959,959),radius=215,outline="#476755",width=16)
dr.rounded_rectangle((184,220,824,680),radius=125,fill="#b4f076")
dr.polygon([(540,672),(710,680),(760,818)],fill="#b4f076")
font_candidates=[r"C:\Windows\Fonts\segoeuib.ttf",r"C:\Windows\Fonts\arialbd.ttf"]
font=None
for candidate in font_candidates:
    try:
        font=ImageFont.truetype(candidate,420)
        break
    except OSError:
        pass
if font:
    box=dr.textbbox((0,0),"S",font=font)
    dr.text(((1024-(box[2]-box[0]))//2-box[0],(900-(box[3]-box[1]))//2-box[1]-50),"S",fill="#193025",font=font)
dr.ellipse((750,200,828,278),fill="#e4ffd3")
icon=base/"shorts-studio.ico"
img.save(icon,format="ICO",sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
print(icon,icon.stat().st_size)
