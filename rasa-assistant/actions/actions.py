import re

from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher


def command_query(tracker, prefixes):
    """Recover an open-vocabulary title or artist from translated text."""
    text = (tracker.latest_message.get("text") or "").strip()
    for prefix in prefixes:
        text = re.sub(prefix, "", text, flags=re.IGNORECASE)
    text = re.sub(r"^(?:the\s+)?(?:song|track|music|playlist)\s+", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(?:latest|newest|most recent)\s+(?:song|track)\b", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(?:song|track|music)\s+(?:by|from)\b", "by", text, flags=re.IGNORECASE)
    text = re.sub(r"\bby\s+", "", text, flags=re.IGNORECASE)
    text = re.sub(r"'s\b", "", text)
    text = re.sub(r"\b(?:please|for me|now|on repeat)\b", "", text, flags=re.IGNORECASE)
    text = re.sub(r"^(?:called|named)\s+", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+playlist$", "", text, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", text).strip(" \t.,!?;:'\"“”")


class ActionPlayMusic(Action):
    def name(self):
        return "action_play_music"

    def run(self, dispatcher, tracker, domain):
        song = tracker.get_slot("song") or command_query(
            tracker,
            [r"^(?:please\s+)?(?:can you\s+)?(?:play|put on|start|listen to)\s+"],
        )
        if not song:
            dispatcher.utter_message(text="Which song should I play? Please say its title.")
            return []

        message = f"Playing {song}."
        dispatcher.utter_message(
            text=message,
            json_message={"leo_command": {"action": "play", "song": song}},
        )
        return []


class ActionPauseMusic(Action):
    def name(self):
        return "action_pause_music"

    def run(self, dispatcher, tracker, domain):
        dispatcher.utter_message(text="Music paused.", json_message={"leo_command": {"action": "pause"}})
        return []


class ActionResumeMusic(Action):
    def name(self):
        return "action_resume_music"

    def run(self, dispatcher, tracker, domain):
        dispatcher.utter_message(text="Resuming music.", json_message={"leo_command": {"action": "resume"}})
        return []


class ActionStopMusic(Action):
    def name(self):
        return "action_stop_music"

    def run(self, dispatcher, tracker, domain):
        dispatcher.utter_message(text="Music stopped.", json_message={"leo_command": {"action": "stop"}})
        return []


class ActionNextSong(Action):
    def name(self):
        return "action_next_song"

    def run(self, dispatcher, tracker, domain):
        dispatcher.utter_message(text="Playing the next song.", json_message={"leo_command": {"action": "next"}})
        return []


class ActionPreviousSong(Action):
    def name(self):
        return "action_previous_song"

    def run(self, dispatcher, tracker, domain):
        dispatcher.utter_message(text="Playing the previous song.", json_message={"leo_command": {"action": "previous"}})
        return []


class ActionIncreaseVolume(Action):
    def name(self):
        return "action_increase_volume"

    def run(self, dispatcher, tracker, domain):
        dispatcher.utter_message(text="Increasing volume.", json_message={"leo_command": {"action": "volume_delta", "value": 10}})
        return []


class ActionDecreaseVolume(Action):
    def name(self):
        return "action_decrease_volume"

    def run(self, dispatcher, tracker, domain):
        dispatcher.utter_message(text="Decreasing volume.", json_message={"leo_command": {"action": "volume_delta", "value": -10}})
        return []


class ActionSetVolume(Action):
    def name(self):
        return "action_set_volume"

    def run(self, dispatcher, tracker, domain):
        volume = tracker.get_slot("volume")
        if volume is None:
            match = re.search(r"\b(\d{1,3})(?=\s|$|%)", tracker.latest_message.get("text", ""))
            volume = match.group(1) if match else None
        try:
            volume = max(0, min(100, int(volume)))
        except (TypeError, ValueError):
            dispatcher.utter_message(text="What volume level should I use? Say a number from 0 to 100.")
            return []
        dispatcher.utter_message(text=f"Setting volume to {volume} percent.", json_message={"leo_command": {"action": "volume", "value": volume}})
        return []


class ActionMute(Action):
    def name(self):
        return "action_mute"

    def run(self, dispatcher, tracker, domain):
        dispatcher.utter_message(text="Music muted.", json_message={"leo_command": {"action": "mute"}})
        return []


class ActionUnmute(Action):
    def name(self):
        return "action_unmute"

    def run(self, dispatcher, tracker, domain):
        dispatcher.utter_message(text="Music unmuted.", json_message={"leo_command": {"action": "unmute"}})
        return []


class ActionCreatePlaylist(Action):
    def name(self):
        return "action_create_playlist"

    def run(self, dispatcher, tracker, domain):
        playlist = tracker.get_slot("playlist") or command_query(
            tracker, [r"^(?:please\s+)?(?:create|make)(?:\s+(?:me|a|an|new))*\s+playlist\s*"]
        )
        if not playlist:
            dispatcher.utter_message(text="What should I name the new playlist?")
            return []
        dispatcher.utter_message(
            text=f"Creating the {playlist} playlist.",
            json_message={"leo_command": {"action": "create_playlist", "playlist": playlist}},
        )
        return []


class ActionDeletePlaylist(Action):
    def name(self):
        return "action_delete_playlist"

    def run(self, dispatcher, tracker, domain):
        playlist = tracker.get_slot("playlist") or command_query(
            tracker, [r"^(?:please\s+)?(?:delete|remove)(?:\s+my)?\s+"]
        )
        if not playlist:
            dispatcher.utter_message(text="Which playlist should I delete?")
            return []
        dispatcher.utter_message(
            text=f"Deleting the {playlist} playlist.",
            json_message={"leo_command": {"action": "delete_playlist", "playlist": playlist}},
        )
        return []


class ActionShuffle(Action):
    def name(self):
        return "action_shuffle"

    def run(self, dispatcher, tracker, domain):
        dispatcher.utter_message(text="Shuffling your music.", json_message={"leo_command": {"action": "shuffle"}})
        return []


class ActionRepeatSong(Action):
    def name(self):
        return "action_repeat_song"

    def run(self, dispatcher, tracker, domain):
        dispatcher.utter_message(text="Repeating this song.", json_message={"leo_command": {"action": "repeat"}})
        return []


class ActionSearchSong(Action):
    def name(self):
        return "action_search_song"

    def run(self, dispatcher, tracker, domain):
        query = tracker.get_slot("song") or command_query(
            tracker, [r"^(?:please\s+)?(?:search for|search|find|look for)\s+"]
        )
        if not query:
            dispatcher.utter_message(text="Which song should I search for?")
            return []
        dispatcher.utter_message(text=f"Searching for {query}.", json_message={"leo_command": {"action": "search", "query": query}})
        return []


class ActionSearchArtist(Action):
    def name(self):
        return "action_search_artist"

    def run(self, dispatcher, tracker, domain):
        query = tracker.get_slot("artist") or command_query(
            tracker, [r"^(?:please\s+)?(?:search for|search|find|show songs by|show)\s+"]
        )
        query = re.sub(r"\s+(?:(?:songs?|music)\s*)?(?:by|from)?\s*$", "", query, flags=re.IGNORECASE)
        query = re.sub(r"\s+(?:songs?|music)$", "", query, flags=re.IGNORECASE)
        if not query:
            dispatcher.utter_message(text="Which artist should I search for?")
            return []
        dispatcher.utter_message(text=f"Searching for {query}.", json_message={"leo_command": {"action": "search", "query": query}})
        return []


class ActionPlayMood(Action):
    def name(self):
        return "action_play_mood"

    def run(self, dispatcher, tracker, domain):
        mood = tracker.get_slot("mood")
        if not mood:
            text = (tracker.latest_message.get("text") or "").lower()
            mood = next((value for value in ("romantic", "happy", "sad", "energetic", "calm", "angry") if value in text), None)
        if mood not in {"happy", "sad", "energetic", "calm", "angry", "romantic"}:
            dispatcher.utter_message(text="What mood of music would you like?")
            return []
        dispatcher.utter_message(text=f"Finding {mood} music for you.", json_message={"leo_command": {"action": "play_mood", "mood": mood}})
        return []


class ActionAddToPlaylist(Action):
    def name(self):
        return "action_add_to_playlist"

    def run(self, dispatcher, tracker, domain):
        playlist = tracker.get_slot("playlist")
        dispatcher.utter_message(
            text=f"Adding the current song to {playlist}." if playlist else "Adding the current song to your playlist.",
            json_message={"leo_command": {"action": "add_to_playlist", "playlist": playlist}},
        )
        return []


class ActionRemoveFromPlaylist(Action):
    def name(self):
        return "action_remove_from_playlist"

    def run(self, dispatcher, tracker, domain):
        playlist = tracker.get_slot("playlist")
        dispatcher.utter_message(
            text=f"Removing the current song from {playlist}." if playlist else "Removing the current song from your playlist.",
            json_message={"leo_command": {"action": "remove_from_playlist", "playlist": playlist}},
        )
        return []


class ActionLikeSong(Action):
    def name(self):
        return "action_like_song"

    def run(self, dispatcher, tracker, domain):
        dispatcher.utter_message(text="Adding the current song to your favorites.", json_message={"leo_command": {"action": "like"}})
        return []


class ActionDislikeSong(Action):
    def name(self):
        return "action_dislike_song"

    def run(self, dispatcher, tracker, domain):
        dispatcher.utter_message(text="Removing the current song from your favorites.", json_message={"leo_command": {"action": "dislike"}})
        return []


class ActionOpenPlaylist(Action):
    def name(self):
        return "action_open_playlist"

    def run(self, dispatcher, tracker, domain):
        playlist = tracker.get_slot("playlist")
        dispatcher.utter_message(
            text=f"Opening {playlist}." if playlist else "Opening your playlists.",
            json_message={"leo_command": {"action": "open_playlist", "playlist": playlist}},
        )
        return []
