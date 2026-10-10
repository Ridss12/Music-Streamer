from pathlib import Path
import zipfile
import re
import shutil

PROJECT = Path.cwd()

SONG_ZIP = Path.home() / "Downloads" / "English_Songs100.zip"
ARTIST_ZIP = Path.home() / "Downloads" / "artists.zip"

SONGS_DIR = PROJECT / "backend" / "songs"
THUMB_DIR = PROJECT / "backend" / "thumbnails"
ARTIST_DIR = PROJECT / "backend" / "artists"

SONGS_DIR.mkdir(parents=True, exist_ok=True)
THUMB_DIR.mkdir(parents=True, exist_ok=True)
ARTIST_DIR.mkdir(parents=True, exist_ok=True)


def parse_song(filename):
    name = Path(filename).stem
    name = re.sub(r"\(\d+\)$", "", name).strip()

    parts = re.split(r"\s+[-–—]\s+", name, maxsplit=1)

    if len(parts) == 2:
        artist = parts[0].replace("_", " ").strip()
        title = parts[1].replace("_", " ").strip()
    else:
        artist = ""
        title = name.replace("_", " ").strip()

    return artist, title


print("Opening English_Songs100.zip...")

with zipfile.ZipFile(SONG_ZIP, "r") as z:

    files = z.namelist()

    songs = sorted(
        x for x in files
        if x.lower().endswith(".mp3")
    )

    thumbnails = sorted(
        x for x in files
        if x.lower().endswith(".png")
        and "lm_thumbnail" in x.lower()
    )

    print(f"Songs found: {len(songs)}")
    print(f"Thumbnails found: {len(thumbnails)}")

    if len(songs) != 100:
        raise Exception(f"Expected 100 songs, found {len(songs)}")

    if len(thumbnails) != 100:
        raise Exception(
            f"Expected 100 thumbnails, found {len(thumbnails)}"
        )

    mapping = []

    for index, song_file in enumerate(songs, start=1):

        artist, title = parse_song(song_file)

        clean_name = re.sub(
            r"[^A-Za-z0-9]+",
            "_",
            f"{index:03d}_{artist}_{title}"
        ).strip("_")

        song_output = SONGS_DIR / f"{clean_name}.mp3"
        thumb_output = THUMB_DIR / f"{index:03d}.png"

        # Extract song
        with z.open(song_file) as source:
            with open(song_output, "wb") as target:
                shutil.copyfileobj(source, target)

        # Extract matching thumbnail
        with z.open(thumbnails[index - 1]) as source:
            with open(thumb_output, "wb") as target:
                shutil.copyfileobj(source, target)

        mapping.append(
            f"{index:03d} | {artist} | {title} | "
            f"{song_output.name} | {thumb_output.name}"
        )

        print(f"{index:03d}/100  {artist} - {title}")


mapping_file = PROJECT / "rivibe_song_mapping.txt"

with open(mapping_file, "w", encoding="utf-8") as f:

    f.write(
        "TRACK | ARTIST | TITLE | SONG FILE | THUMBNAIL\n"
    )

    f.write("-" * 100 + "\n")

    for row in mapping:
        f.write(row + "\n")


print("\nOpening artists.zip...")

with zipfile.ZipFile(ARTIST_ZIP, "r") as z:

    artist_files = [
        x for x in z.namelist()
        if x.lower().endswith(
            (".jpg", ".jpeg", ".png", ".webp")
        )
    ]

    for artist_file in artist_files:

        output = ARTIST_DIR / Path(artist_file).name

        with z.open(artist_file) as source:
            with open(output, "wb") as target:
                shutil.copyfileobj(source, target)


print("\n================================")
print("RIVIBE SONG ORGANIZATION DONE")
print("================================")

print(f"Songs      : {len(list(SONGS_DIR.glob('*.mp3')))}")
print(f"Thumbnails : {len(list(THUMB_DIR.glob('*.png')))}")
print(f"Artists    : {len(list(ARTIST_DIR.iterdir()))}")
print(f"Mapping    : {mapping_file}")
