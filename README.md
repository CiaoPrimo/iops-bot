# Internal Operations Bot

# Staff HR Discord Bot

A comprehensive Discord bot for managing staff and HR operations in your server. Features application systems, staff onboarding, warnings, leave of absence management, activity tracking, and much more.

## 🌟 Features

### Staff & HR Management
- **Application System**: Interactive forms for role applications with HR review panel
- **Staff Onboarding**: Automated role assignment and welcome messages
- **Warning System**: Issue, view, and manage staff infractions
- **Termination System**: Secure staff termination with logging
- **Leave of Absence (LOA)**: Request and manage staff leave

### Administrative Tools
- **Role Management**: Promote/demote staff with proper role hierarchy
- **Activity Logging**: Track and report staff activity
- **Announcements**: Send formatted announcements to staff
- **Feedback System**: Anonymous and logged feedback collection
- **Tag System**: Quick access to predefined responses

### Advanced Features
- **On-Call System**: Mark staff as available for urgent matters
- **Scheduled Tasks**: Automated reminders and reports
- **Comprehensive Logging**: All actions logged with timestamps
- **Permission System**: Role-based access control
- **Database Storage**: Persistent data with MongoDB

## 🚀 Quick Start

### Prerequisites
- Node.js 16.0.0 or higher
- MongoDB database (local or Atlas)
- Discord bot token

### Installation

1. **Clone or download the bot files**
2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   - Copy `.env.example` to `.env`
   - Fill in your bot token, owner ID, and MongoDB URI

4. **Configure your Discord bot**:
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application and bot
   - Copy the bot token to your `.env` file
   - Enable necessary intents (Guilds, Guild Messages, Message Content, Guild Members)

5. **Start the bot**:
   ```bash
   npm start
   ```

## ⚙️ Configuration

### Initial Setup
1. Invite the bot to your server with Administrator permissions
2. Use `/config set` commands to configure roles and channels:

```
/config set roles.staff ROLE_ID
/config set roles.hr ROLE_ID  
/config set roles.admin ROLE_ID
/config set channels.applications CHANNEL_ID
/config set channels.staffLog CHANNEL_ID
/config set channels.announcements CHANNEL_ID
/config set channels.feedback CHANNEL_ID
```

### Required Permissions
The bot needs the following permissions:
- Read Messages/View Channels
- Send Messages
- Embed Links
- Attach Files
- Read Message History
- Manage Roles
- Manage Messages

## 📋 Commands Reference

### Configuration Commands
- `/config set <key> <value>` - Set configuration values
- `/config view` - View current configuration

### Application System
- `/apply` - Apply for a staff position
- `/application approve <user> <role>` - Approve an application (HR+)
- `/application deny <user> <reason>` - Deny an application (HR+)

### Staff Management
- `/warn <user> <reason> [proof]` - Issue a warning (HR+)
- `/infractions <user>` - View user's infractions (HR+)
- `/clearinfractions <user>` - Clear all infractions (Admin+)
- `/terminate <user> <reason>` - Terminate staff member (Admin+)

### Role Management
- `/promote <user> <role>` - Promote staff member (Admin+)
- `/demote <user>` - Demote staff member (Admin+)

### Leave of Absence
- `/loa <duration> <reason>` - Request LOA (Staff+)
- `/loa-manage approve <user>` - Approve LOA (HR+)
- `/loa-manage deny <user> <reason>` - Deny LOA (HR+)
- `/loa-manage list` - List active LOAs (HR+)

### Communication
- `/announce <message> [channel] [ping]` - Send announcement (HR+)
- `/feedback <message> [anonymous]` - Submit feedback
- `/tag <name>` - Use a predefined tag
- `/tag-manage create <name> <content>` - Create tag (HR+)

### Activity Tracking
- `/logactivity <activity> [hours]` - Log your activity (Staff+)
- `/staffreport [user] [period]` - View activity reports (HR+)

### On-Call System
- `/oncall set` - Mark yourself as on-call (Staff+)
- `/oncall unset` - Remove on-call status (Staff+)
- `/oncall list` - List on-call staff (Staff+)

### Owner Commands
- `/eval <code>` - Execute JavaScript code (Owner only)

### Prefix Commands
- `!ping` - Check bot latency
- `!help` - Show help information
- `!oncall` - Quick on-call staff ping

## 🗄️ Database Collections

The bot uses the following MongoDB collections:
- `configs` - Server configurations
- `applications` - Staff applications
- `warnings` - Staff warnings and infractions
- `terminations` - Termination records
- `loa` - Leave of absence requests
- `activity` - Staff activity logs
- `feedback` - Feedback submissions
- `tags` - Custom tags
- `oncall` - On-call staff status

## 🔧 Scheduled Tasks

- **Daily Reminders** (9 AM): Staff activity reminders
- **Weekly Reports** (Sunday 6 PM): Activity summary reports
- **LOA Cleanup** (Daily): Expire old LOA requests

## 🛡️ Security Features

- Role-based permission system
- Owner-only eval command protection
- Input validation and sanitization
- Secure database operations
- Comprehensive audit logging

## 🐛 Troubleshooting

### Common Issues

1. **Bot not responding to slash commands**:
   - Ensure the bot has been invited with proper permissions
   - Check that slash commands are registered (console should show success message)

2. **Database connection errors**:
   - Verify MongoDB URI in `.env` file
   - Ensure MongoDB service is running (if local)
   - Check network connectivity (if using Atlas)

3. **Permission errors**:
   - Configure roles using `/config set` commands
   - Ensure bot has Manage Roles permission
   - Check role hierarchy (bot's role must be higher)

4. **Missing features**:
   - Set up all required channels using `/config set`
   - Verify bot permissions in each channel

### Support

If you encounter issues:
1. Check the console for error messages
2. Verify your configuration with `/config view`
3. Ensure all required environment variables are set
4. Check bot permissions in Discord

## 📝 Customization

The bot is highly modular and can be customized:
- Modify scheduled task times in the `startScheduledTasks()` function
- Add new commands by following the existing pattern
- Customize embed colors and formatting
- Add additional database fields as needed

## 🔄 Updates

To update the bot:
1. Backup your database
2. Replace the bot files
3. Run `npm install` to update dependencies
4. Restart the bot

## 📄 License

This project is licensed under the MIT License. You are free to use, modify, and distribute this software as per the license terms.
