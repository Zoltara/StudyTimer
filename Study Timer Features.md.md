I want you to build a web app with a futuristic design.
This is a Pomodoro based Study Timer webapp that should be able to run in a browser and adjust nicely to a phone size screen.

## Features:
* Study Timer with Accountability Partners.
* One user can create a study group where other users can join using a code or QR code.
* Any user can create own groups to be shared with others.
* Each study group must have a name and a focus topic.
* Include a list of current group members where only the creator can remove users.
* Unactive users removed automatically after 60 min of inactivity.
* Only the creator can deleted the group he/she created.
* The app remembers users and sessions using Supabase.
* This app can run on mobile phone via a browser using vercel.app

## Pomodoro Timer
* Adjustable Pomodoro timer with focus sessions, cool design.
* The group creator can adjust the pomodoro timer and all the other users in the group will see the same timer and be synced with it.
* Other users can choose to set their own (unsynced) timer.
* Pmodoro defaults settings: 25min focus session, 3 min short break, sfter 3 cycles - 10 min long break. All of these paramter are adjustable.
* The timer shows the time and an additional animation of visual round timer than animates the reduction in time until the circlt is complete.
* The pomodoro paremeters are shown on the timer as well.
* Each phase of the timer has a unique sound that i will provide for you.

## Chat feature
* Users can chat between them during the session.
* A gentle notification sound when a message is sent.
* The chat must respond in real-time so all other users recieve the message as soon as it sent.
* When a user in the chat quits the pomodoro, it sends an automatic message to the chat, "[name] is out."
* When a break is on - message sent to all users: "3 min break" or "10 min break".
* When focus session restarts, the user must confirm "I'm here" or he will recieve a voice message: "[Name] it's time to focus".
* If the user doesn't confirm "I'm here", he will be removed from the group within 10 min, and message will be sent to all other users: "[name] has left the group".
* Make sure that new notification appear near the input box.
* Add button: Clear chat

## Leaderboard feature
* Leaderboard of study streaks.
* Rank the users with the one with most streaks at the top with relevant icons.
* The streak are accumulated throughout all session in this study group.
* A user who who left the group will be marked in red with relevant icon.

## Calendar feature
* Integration with calendar for exam countdowns.
* Any user can add an exam with a date. All users see the same calendar.
* There is a days countdown to the exam date with colors (more than a month - green, 1-4 weeks - yellow, 1 week or less - red).
* After exam date, it is automatically removed from the calendar.
* Only the group creator can delete exams.

Ask question if you need more clarifications.
p.s
I'm not a programmer and i have no thecnical skills, I'm counting on you to build the app and guide me with anything you may need to make it run smoothly, such as API keys etc.