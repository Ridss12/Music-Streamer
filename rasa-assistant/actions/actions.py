from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher


class ActionPlayMusic(Action):
    def name(self):
        return "action_play_music"

    def run(self, dispatcher, tracker, domain):
        song = tracker.get_slot("song")
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
        playlist = tracker.get_slot("playlist")
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
        playlist = tracker.get_slot("playlist")
        if not playlist:
            dispatcher.utter_message(text="Which playlist should I delete?")
            return []
        dispatcher.utter_message(
            text=f"Deleting the {playlist} playlist.",
            json_message={"leo_command": {"action": "delete_playlist", "playlist": playlist}},
        )
        return []
