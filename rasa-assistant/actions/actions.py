from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher

class ActionIncreaseVolume(Action):
    def name(self):
        return "action_increase_volume"

    def run(self, dispatcher, tracker, domain):
        dispatcher.utter_message(text="Increasing volume.")
        return []


class ActionDecreaseVolume(Action):
    def name(self):
        return "action_decrease_volume"

    def run(self, dispatcher, tracker, domain):
        dispatcher.utter_message(text="Decreasing volume.")
        return []


class ActionMute(Action):
    def name(self):
        return "action_mute"

    def run(self, dispatcher, tracker, domain):
        dispatcher.utter_message(text="Music muted.")
        return []


class ActionUnmute(Action):
    def name(self):
        return "action_unmute"

    def run(self, dispatcher, tracker, domain):
        dispatcher.utter_message(text="Music unmuted.")
        return []
