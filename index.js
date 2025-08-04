const { Client, GatewayIntentBits, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, SlashCommandBuilder, ChannelType } = require('discord.js');
const { MongoClient } = require('mongodb');
const cron = require('node-cron');
require('dotenv').config();

// Bot Configuration
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

// Collections for commands and cooldowns
client.commands = new Collection();
client.slashCommands = new Collection();
client.cooldowns = new Collection();

// Database setup
let db;
const mongoClient = new MongoClient(process.env.MONGODB_URI);

// Bot Configuration Schema
const defaultConfig = {
    prefix: '-',
    roles: {
        staff: null,
        hr: null,
        admin: null,
        owner: null
    },
    channels: {
        applications: null,
        staffLog: null,
        announcements: null,
        feedback: null
    },
    features: {
        applicationsEnabled: true,
        loaEnabled: true,
        remindersEnabled: true
    }
};

// Permission checker utility
function hasPermission(member, requiredRole, config) {
    if (!config.roles[requiredRole]) return false;
    
    const roleHierarchy = ['owner', 'admin', 'hr', 'staff'];
    const requiredIndex = roleHierarchy.indexOf(requiredRole);
    
    for (let i = 0; i <= requiredIndex; i++) {
        const roleId = config.roles[roleHierarchy[i]];
        if (roleId && member.roles.cache.has(roleId)) {
            return true;
        }
    }
    
    return member.permissions.has(PermissionFlagsBits.Administrator);
}

// Database helper functions
async function getGuildConfig(guildId) {
    const config = await db.collection('configs').findOne({ guildId });
    return config ? { ...defaultConfig, ...config } : defaultConfig;
}

async function updateGuildConfig(guildId, updates) {
    await db.collection('configs').updateOne(
        { guildId },
        { $set: { ...updates, guildId } },
        { upsert: true }
    );
}

// Logging function
async function logAction(guild, action, user, details = {}) {
    const config = await getGuildConfig(guild.id);
    const logChannel = guild.channels.cache.get(config.channels.staffLog);
    
    if (!logChannel) return;
    
    const embed = new EmbedBuilder()
        .setTitle(`Staff Action: ${action}`)
        .setColor(details.color || '#3498db')
        .addFields(
            { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
            { name: 'Action By', value: details.actionBy || 'System', inline: true },
            { name: 'Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
        )
        .setThumbnail(user.displayAvatarURL());
    
    if (details.reason) embed.addFields({ name: 'Reason', value: details.reason });
    if (details.additional) {
        for (const [key, value] of Object.entries(details.additional)) {
            embed.addFields({ name: key, value: value.toString(), inline: true });
        }
    }
    
    await logChannel.send({ embeds: [embed] });
}

// Application System
async function createApplicationForm(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('staff_application')
        .setTitle('Staff Application Form');
    
    const nameInput = new TextInputBuilder()
        .setCustomId('applicant_name')
        .setLabel('Full Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
    
    const ageInput = new TextInputBuilder()
        .setCustomId('applicant_age')
        .setLabel('Age')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
    
    const experienceInput = new TextInputBuilder()
        .setCustomId('applicant_experience')
        .setLabel('Previous Experience')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
    
    const motivationInput = new TextInputBuilder()
        .setCustomId('applicant_motivation')
        .setLabel('Why do you want to join our staff?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
    
    const availabilityInput = new TextInputBuilder()
        .setCustomId('applicant_availability')
        .setLabel('Availability (hours per week, timezone)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(ageInput),
        new ActionRowBuilder().addComponents(experienceInput),
        new ActionRowBuilder().addComponents(motivationInput),
        new ActionRowBuilder().addComponents(availabilityInput)
    );
    
    await interaction.showModal(modal);
}

// Slash Commands Registration
const slashCommands = [
    // Config Commands
    new SlashCommandBuilder()
        .setName('config')
        .setDescription('Configure bot settings')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set a configuration value')
                .addStringOption(option =>
                    option.setName('key')
                        .setDescription('Configuration key (e.g., channels.staffLog, roles.hr)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('value')
                        .setDescription('Configuration value (channel/role ID)')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View current configuration')),
    
    // Application Commands
    new SlashCommandBuilder()
        .setName('apply')
        .setDescription('Apply for a staff position'),
    
    new SlashCommandBuilder()
        .setName('application')
        .setDescription('Manage applications')
        .addSubcommand(subcommand =>
            subcommand
                .setName('approve')
                .setDescription('Approve an application')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to approve')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('role')
                        .setDescription('Role to assign')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Staff', value: 'staff' },
                            { name: 'HR', value: 'hr' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('deny')
                .setDescription('Deny an application')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to deny')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for denial')
                        .setRequired(true))),
    
    // Staff Management Commands
    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Issue a warning to a staff member')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Staff member to warn')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for warning')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('proof')
                .setDescription('Evidence/proof (URL or description)')
                .setRequired(false)),
    
    new SlashCommandBuilder()
        .setName('infractions')
        .setDescription('View infractions for a staff member')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Staff member to check')
                .setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('clearinfractions')
        .setDescription('Clear all infractions for a staff member')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Staff member to clear')
                .setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('terminate')
        .setDescription('Terminate a staff member')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Staff member to terminate')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for termination')
                .setRequired(true)),
    
    // LOA Commands
    new SlashCommandBuilder()
        .setName('loa')
        .setDescription('Request leave of absence')
        .addStringOption(option =>
            option.setName('duration')
                .setDescription('Duration of leave (e.g., "1 week", "2 days")')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for leave')
                .setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('loa-manage')
        .setDescription('Manage LOA requests')
        .addSubcommand(subcommand =>
            subcommand
                .setName('approve')
                .setDescription('Approve a LOA request')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User whose LOA to approve')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('deny')
                .setDescription('Deny a LOA request')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User whose LOA to deny')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for denial')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all active LOAs')),
    
    // Role Management
    new SlashCommandBuilder()
        .setName('promote')
        .setDescription('Promote a staff member')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to promote')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('role')
                .setDescription('Role to promote to')
                .setRequired(true)
                .addChoices(
                    { name: 'Staff', value: 'staff' },
                    { name: 'HR', value: 'hr' },
                    { name: 'Admin', value: 'admin' }
                )),
    
    new SlashCommandBuilder()
        .setName('demote')
        .setDescription('Demote a staff member')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to demote')
                .setRequired(true)),
    
    // Announcement Commands
    new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Send an announcement')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Announcement message')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to send to (default: announcements)')
                .setRequired(false))
        .addRoleOption(option =>
            option.setName('ping')
                .setDescription('Role to ping')
                .setRequired(false)),
    
    // Feedback System
    new SlashCommandBuilder()
        .setName('feedback')
        .setDescription('Submit feedback to HR')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Your feedback')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('anonymous')
                .setDescription('Submit anonymously')
                .setRequired(false)),
    
    // Activity Logging
    new SlashCommandBuilder()
        .setName('logactivity')
        .setDescription('Log your activity')
        .addStringOption(option =>
            option.setName('activity')
                .setDescription('Description of activity')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('hours')
                .setDescription('Hours worked')
                .setRequired(false)),
    
    new SlashCommandBuilder()
        .setName('staffreport')
        .setDescription('View staff activity report')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Specific user to check')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('period')
                .setDescription('Time period')
                .setRequired(false)
                .addChoices(
                    { name: 'Today', value: 'today' },
                    { name: 'This Week', value: 'week' },
                    { name: 'This Month', value: 'month' }
                )),
    
    // Tag System
    new SlashCommandBuilder()
        .setName('tag')
        .setDescription('Use a predefined tag')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Tag name')
                .setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('tag-manage')
        .setDescription('Manage tags')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new tag')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Tag name')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('content')
                        .setDescription('Tag content')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Delete a tag')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Tag name')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all tags')),
    
    // Eval Command (Owner only)
    new SlashCommandBuilder()
        .setName('eval')
        .setDescription('Execute JavaScript code (Owner only)')
        .addStringOption(option =>
            option.setName('code')
                .setDescription('JavaScript code to execute')
                .setRequired(true)),
    
    // On-call System
    new SlashCommandBuilder()
        .setName('oncall')
        .setDescription('Manage on-call status')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set yourself as on-call'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('unset')
                .setDescription('Remove yourself from on-call'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List who is on-call'))
];

// Event: Ready
client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    
    // Connect to MongoDB
    try {
        await mongoClient.connect();
        db = mongoClient.db('staffbot');
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
    
    // Register slash commands
    try {
        await client.application.commands.set(slashCommands);
        console.log('Slash commands registered successfully');
    } catch (error) {
        console.error('Error registering slash commands:', error);
    }
    
    // Start scheduled tasks
    startScheduledTasks();
});

// Event: Interaction Create (Slash Commands & Modals)
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        await handleSlashCommand(interaction);
    } else if (interaction.isModalSubmit()) {
        await handleModalSubmit(interaction);
    } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
    }
});

// Handle Slash Commands
async function handleSlashCommand(interaction) {
    const { commandName } = interaction;
    const config = await getGuildConfig(interaction.guild.id);
    
    try {
        switch (commandName) {
            case 'config':
                await handleConfigCommand(interaction, config);
                break;
            case 'apply':
                await handleApplyCommand(interaction, config);
                break;
            case 'application':
                await handleApplicationCommand(interaction, config);
                break;
            case 'warn':
                await handleWarnCommand(interaction, config);
                break;
            case 'infractions':
                await handleInfractionsCommand(interaction, config);
                break;
            case 'clearinfractions':
                await handleClearInfractionsCommand(interaction, config);
                break;
            case 'terminate':
                await handleTerminateCommand(interaction, config);
                break;
            case 'loa':
                await handleLoaCommand(interaction, config);
                break;
            case 'loa-manage':
                await handleLoaManageCommand(interaction, config);
                break;
            case 'promote':
                await handlePromoteCommand(interaction, config);
                break;
            case 'demote':
                await handleDemoteCommand(interaction, config);
                break;
            case 'announce':
                await handleAnnounceCommand(interaction, config);
                break;
            case 'feedback':
                await handleFeedbackCommand(interaction, config);
                break;
            case 'logactivity':
                await handleLogActivityCommand(interaction, config);
                break;
            case 'staffreport':
                await handleStaffReportCommand(interaction, config);
                break;
            case 'tag':
                await handleTagCommand(interaction, config);
                break;
            case 'tag-manage':
                await handleTagManageCommand(interaction, config);
                break;
            case 'eval':
                await handleEvalCommand(interaction, config);
                break;
            case 'oncall':
                await handleOnCallCommand(interaction, config);
                break;
        }
    } catch (error) {
        console.error(`Error handling command ${commandName}:`, error);
        const reply = { content: 'An error occurred while executing this command.', ephemeral: true };
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(reply);
        } else {
            await interaction.reply(reply);
        }
    }
}

// Config Command Handler
async function handleConfigCommand(interaction, config) {
    if (!hasPermission(interaction.member, 'admin', config)) {
        return interaction.reply({ content: 'You need admin permissions to use this command.', ephemeral: true });
    }
    
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'set') {
        const key = interaction.options.getString('key');
        const value = interaction.options.getString('value');
        
        // Parse nested keys (e.g., 'channels.staffLog')
        const keys = key.split('.');
        let updateObj = {};
        let current = updateObj;
        
        for (let i = 0; i < keys.length - 1; i++) {
            current[keys[i]] = {};
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
        
        await updateGuildConfig(interaction.guild.id, updateObj);
        
        await interaction.reply({
            content: `Configuration updated: \`${key}\` = \`${value}\``,
            ephemeral: true
        });
    } else if (subcommand === 'view') {
        const embed = new EmbedBuilder()
            .setTitle('Bot Configuration')
            .setColor('#3498db')
            .addFields(
                { name: 'Prefix', value: config.prefix || 'Not set', inline: true },
                { name: 'Staff Role', value: config.roles.staff ? `<@&${config.roles.staff}>` : 'Not set', inline: true },
                { name: 'HR Role', value: config.roles.hr ? `<@&${config.roles.hr}>` : 'Not set', inline: true },
                { name: 'Admin Role', value: config.roles.admin ? `<@&${config.roles.admin}>` : 'Not set', inline: true },
                { name: 'Applications Channel', value: config.channels.applications ? `<#${config.channels.applications}>` : 'Not set', inline: true },
                { name: 'Staff Log Channel', value: config.channels.staffLog ? `<#${config.channels.staffLog}>` : 'Not set', inline: true }
            );
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

// Apply Command Handler
async function handleApplyCommand(interaction, config) {
    if (!config.features.applicationsEnabled) {
        return interaction.reply({ content: 'Applications are currently disabled.', ephemeral: true });
    }
    
    // Check if user already has an active application
    const existingApp = await db.collection('applications').findOne({
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        status: 'pending'
    });
    
    if (existingApp) {
        return interaction.reply({ content: 'You already have a pending application.', ephemeral: true });
    }
    
    await createApplicationForm(interaction);
}

// Application Management Handler
async function handleApplicationCommand(interaction, config) {
    if (!hasPermission(interaction.member, 'hr', config)) {
        return interaction.reply({ content: 'You need HR permissions to manage applications.', ephemeral: true });
    }
    
    const subcommand = interaction.options.getSubcommand();
    const user = interaction.options.getUser('user');
    
    if (subcommand === 'approve') {
        const role = interaction.options.getString('role');
        const roleId = config.roles[role];
        
        if (!roleId) {
            return interaction.reply({ content: `${role} role not configured.`, ephemeral: true });
        }
        
        // Add role to user
        const member = await interaction.guild.members.fetch(user.id);
        await member.roles.add(roleId);
        
        // Update application status
        await db.collection('applications').updateOne(
            { userId: user.id, guildId: interaction.guild.id, status: 'pending' },
            { $set: { status: 'approved', approvedBy: interaction.user.id, approvedAt: new Date() } }
        );
        
        // Send welcome DM
        try {
            const welcomeEmbed = new EmbedBuilder()
                .setTitle('Application Approved! 🎉')
                .setDescription(`Congratulations! Your application for **${role}** position has been approved.`)
                .setColor('#00ff00')
                .addFields(
                    { name: 'Next Steps', value: 'Please read the staff guidelines and join the staff channels.' }
                );
            
            await user.send({ embeds: [welcomeEmbed] });
        } catch (error) {
            console.error('Could not send DM to approved user:', error);
        }
        
        // Log the action
        await logAction(interaction.guild, 'Application Denied', user, {
            actionBy: interaction.user.tag,
            color: '#ff0000',
            reason: reason
        });
    }
}

// Scheduled Tasks
function startScheduledTasks() {
    // Daily reminder task (9 AM)
    cron.schedule('0 9 * * *', async () => {
        console.log('Running daily staff reminders...');
        
        const guilds = await db.collection('configs').find({}).toArray();
        
        for (const guildConfig of guilds) {
            try {
                const guild = client.guilds.cache.get(guildConfig.guildId);
                if (!guild) continue;
                
                const announcementChannel = guild.channels.cache.get(guildConfig.channels.announcements);
                if (!announcementChannel) continue;
                
                const embed = new EmbedBuilder()
                    .setTitle('📋 Daily Staff Reminder')
                    .setDescription('Good morning staff! Don\'t forget to:\n\n• Log your daily activity with `/logactivity`\n• Check for any pending tasks\n• Review staff channels for updates')
                    .setColor('#3498db')
                    .setTimestamp();
                
                await announcementChannel.send({ embeds: [embed] });
            } catch (error) {
                console.error(`Error sending daily reminder for guild ${guildConfig.guildId}:`, error);
            }
        }
    });
    
    // Weekly activity report (Sundays at 6 PM)
    cron.schedule('0 18 * * 0', async () => {
        console.log('Generating weekly activity reports...');
        
        const guilds = await db.collection('configs').find({}).toArray();
        
        for (const guildConfig of guilds) {
            try {
                const guild = client.guilds.cache.get(guildConfig.guildId);
                if (!guild) continue;
                
                const logChannel = guild.channels.cache.get(guildConfig.channels.staffLog);
                if (!logChannel) continue;
                
                // Get weekly activity data
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                
                const activities = await db.collection('activity')
                    .find({ 
                        guildId: guild.id,
                        loggedAt: { $gte: weekAgo }
                    })
                    .toArray();
                
                if (activities.length === 0) continue;
                
                // Group by user
                const userStats = {};
                for (const activity of activities) {
                    if (!userStats[activity.userId]) {
                        userStats[activity.userId] = { count: 0, hours: 0 };
                    }
                    userStats[activity.userId].count++;
                    userStats[activity.userId].hours += activity.hours;
                }
                
                const embed = new EmbedBuilder()
                    .setTitle('📊 Weekly Activity Report')
                    .setDescription('Staff activity summary for the past week')
                    .setColor('#2ecc71')
                    .setTimestamp();
                
                for (const [userId, stats] of Object.entries(userStats)) {
                    try {
                        const user = await client.users.fetch(userId);
                        embed.addFields({
                            name: user.tag,
                            value: `${stats.count} activities, ${stats.hours} hours`,
                            inline: true
                        });
                    } catch (error) {
                        console.error(`Error fetching user ${userId}:`, error);
                    }
                }
                
                await logChannel.send({ embeds: [embed] });
            } catch (error) {
                console.error(`Error generating weekly report for guild ${guildConfig.guildId}:`, error);
            }
        }
    });
    
    // Clean up expired LOAs (daily check)
    cron.schedule('0 0 * * *', async () => {
        console.log('Cleaning up expired LOAs...');
        
        try {
            // This is a simple cleanup - in a real scenario, you'd want more sophisticated date parsing
            const result = await db.collection('loa').updateMany(
                { 
                    status: 'approved',
                    // Simple check - could be enhanced with actual end dates
                    approvedAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // 30 days old
                },
                { $set: { status: 'expired', expiredAt: new Date() } }
            );
            
            if (result.modifiedCount > 0) {
                console.log(`Expired ${result.modifiedCount} LOA requests`);
            }
        } catch (error) {
            console.error('Error cleaning up LOAs:', error);
        }
    });
}

// Prefix Commands Handler (for backwards compatibility)
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    
    const config = await getGuildConfig(message.guild.id);
    const prefix = config.prefix || '!';
    
    if (!message.content.startsWith(prefix)) return;
    
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    
    // Simple prefix commands for quick access
    switch (commandName) {
        case 'ping':
            await message.reply(`🏓 Pong! Latency: ${Date.now() - message.createdTimestamp}ms`);
            break;
            
        case 'help':
            const helpEmbed = new EmbedBuilder()
                .setTitle('🤖 Staff Bot Help')
                .setDescription('This bot manages staff and HR operations. Use slash commands for full functionality.')
                .setColor('#3498db')
                .addFields(
                    { name: 'Quick Commands', value: `\`${prefix}ping\` - Check bot latency\n\`${prefix}help\` - Show this help` },
                    { name: 'Main Commands', value: 'Use `/` commands for all features:\n• `/apply` - Apply for staff\n• `/warn` - Issue warnings\n• `/loa` - Request leave\n• `/announce` - Make announcements\n• And many more!' },
                    { name: 'Configuration', value: `Use \`/config\` to set up channels and roles` }
                )
                .setFooter({ text: 'Use /help [command] for detailed command info' });
            
            await message.reply({ embeds: [helpEmbed] });
            break;
            
        case 'oncall':
            if (!hasPermission(message.member, 'staff', config)) {
                return message.reply('You need staff permissions to check on-call status.');
            }
            
            const onCallStaff = await db.collection('oncall')
                .find({ guildId: message.guild.id, active: true })
                .toArray();
            
            if (onCallStaff.length === 0) {
                return message.reply('No staff members are currently on-call.');
            }
            
            const mentions = [];
            for (const staff of onCallStaff) {
                mentions.push(`<@${staff.userId}>`);
            }
            
            await message.reply(`🚨 On-call staff: ${mentions.join(', ')}`);
            break;
    }
});

// Error Handling
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    
    try {
        await mongoClient.close();
        console.log('MongoDB connection closed');
    } catch (error) {
        console.error('Error closing MongoDB connection:', error);
    }
    
    client.destroy();
    process.exit(0);
});

// Login
client.login(process.env.BOT_TOKEN);d, 'Application Approved', user, {
            actionBy: interaction.user.tag,
            color: '#00ff00',
            additional: { 'Role Assigned': role }
        });
        
        await interaction.reply({ content: `Approved ${user.tag} for ${role} position.`, ephemeral: true });
        
    } else if (subcommand === 'deny') {
        const reason = interaction.options.getString('reason');
        
        // Update application status
        await db.collection('applications').updateOne(
            { userId: user.id, guildId: interaction.guild.id, status: 'pending' },
            { $set: { status: 'denied', deniedBy: interaction.user.id, deniedAt: new Date(), denialReason: reason } }
        );
        
        // Send denial DM
        try {
            const denialEmbed = new EmbedBuilder()
                .setTitle('Application Update')
                .setDescription('We appreciate your interest in joining our staff team.')
                .setColor('#ff0000')
                .addFields(
                    { name: 'Status', value: 'Unfortunately, your application was not approved at this time.' },
                    { name: 'Feedback', value: reason }
                );
            
            await user.send({ embeds: [denialEmbed] });
        } catch (error) {
            console.error('Could not send DM to denied user:', error);
        }
        
        await logAction(interaction.guild, 'Application Denied', user, {
            actionBy: interaction.user.tag,
            color: '#ff0000',
            reason: reason
        });
        
        await interaction.reply({ content: `Denied application from ${user.tag}.`, ephemeral: true });
    }
}

// Warning Command Handler
async function handleWarnCommand(interaction, config) {
    if (!hasPermission(interaction.member, 'hr', config)) {
        return interaction.reply({ content: 'You need HR permissions to issue warnings.', ephemeral: true });
    }
    
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const proof = interaction.options.getString('proof');
    
    // Store warning in database
    const warning = {
        userId: user.id,
        guildId: interaction.guild.id,
        reason: reason,
        proof: proof,
        issuedBy: interaction.user.id,
        issuedAt: new Date()
    };
    
    await db.collection('warnings').insertOne(warning);
    
    // Get total warning count
    const warningCount = await db.collection('warnings').countDocuments({
        userId: user.id,
        guildId: interaction.guild.id
    });
    
    // Log the warning
    await logAction(interaction.guild, 'Warning Issued', user, {
        actionBy: interaction.user.tag,
        color: '#ff9900',
        reason: reason,
        additional: {
            'Warning Count': warningCount,
            'Proof': proof || 'None provided'
        }
    });
    
    // Send DM to warned user
    try {
        const warnEmbed = new EmbedBuilder()
            .setTitle('Staff Warning Issued')
            .setDescription('You have received a formal warning.')
            .setColor('#ff9900')
            .addFields(
                { name: 'Reason', value: reason },
                { name: 'Total Warnings', value: warningCount.toString() }
            );
        
        if (proof) warnEmbed.addFields({ name: 'Evidence', value: proof });
        
        await user.send({ embeds: [warnEmbed] });
    } catch (error) {
        console.error('Could not send warning DM:', error);
    }
    
    await interaction.reply({
        content: `Issued warning to ${user.tag}. Total warnings: ${warningCount}`,
        ephemeral: true
    });
}

// Infractions Command Handler
async function handleInfractionsCommand(interaction, config) {
    if (!hasPermission(interaction.member, 'hr', config)) {
        return interaction.reply({ content: 'You need HR permissions to view infractions.', ephemeral: true });
    }
    
    const user = interaction.options.getUser('user');
    
    const warnings = await db.collection('warnings')
        .find({ userId: user.id, guildId: interaction.guild.id })
        .sort({ issuedAt: -1 })
        .limit(10)
        .toArray();
    
    if (warnings.length === 0) {
        return interaction.reply({
            content: `${user.tag} has no infractions on record.`,
            ephemeral: true
        });
    }
    
    const embed = new EmbedBuilder()
        .setTitle(`Infractions for ${user.tag}`)
        .setColor('#ff9900')
        .setThumbnail(user.displayAvatarURL())
        .addFields({ name: 'Total Warnings', value: warnings.length.toString(), inline: true });
    
    warnings.forEach((warning, index) => {
        const issuedBy = interaction.guild.members.cache.get(warning.issuedBy)?.user.tag || 'Unknown';
        embed.addFields({
            name: `Warning #${index + 1}`,
            value: `**Reason:** ${warning.reason}\n**Issued by:** ${issuedBy}\n**Date:** <t:${Math.floor(warning.issuedAt.getTime() / 1000)}:f>`,
            inline: false
        });
    });
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Clear Infractions Handler
async function handleClearInfractionsCommand(interaction, config) {
    if (!hasPermission(interaction.member, 'admin', config)) {
        return interaction.reply({ content: 'You need admin permissions to clear infractions.', ephemeral: true });
    }
    
    const user = interaction.options.getUser('user');
    
    const result = await db.collection('warnings').deleteMany({
        userId: user.id,
        guildId: interaction.guild.id
    });
    
    await logAction(interaction.guild, 'Infractions Cleared', user, {
        actionBy: interaction.user.tag,
        color: '#00ff00',
        additional: { 'Warnings Cleared': result.deletedCount }
    });
    
    await interaction.reply({
        content: `Cleared ${result.deletedCount} infractions for ${user.tag}.`,
        ephemeral: true
    });
}

// Terminate Command Handler
async function handleTerminateCommand(interaction, config) {
    if (!hasPermission(interaction.member, 'admin', config)) {
        return interaction.reply({ content: 'You need admin permissions to terminate staff.', ephemeral: true });
    }
    
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    
    const member = await interaction.guild.members.fetch(user.id);
    
    // Remove all staff roles
    const rolesToRemove = [];
    if (config.roles.staff && member.roles.cache.has(config.roles.staff)) {
        rolesToRemove.push(config.roles.staff);
    }
    if (config.roles.hr && member.roles.cache.has(config.roles.hr)) {
        rolesToRemove.push(config.roles.hr);
    }
    if (config.roles.admin && member.roles.cache.has(config.roles.admin)) {
        rolesToRemove.push(config.roles.admin);
    }
    
    if (rolesToRemove.length > 0) {
        await member.roles.remove(rolesToRemove);
    }
    
    // Store termination record
    const termination = {
        userId: user.id,
        guildId: interaction.guild.id,
        reason: reason,
        terminatedBy: interaction.user.id,
        terminatedAt: new Date(),
        rolesRemoved: rolesToRemove
    };
    
    await db.collection('terminations').insertOne(termination);
    
    // Log the termination
    await logAction(interaction.guild, 'Staff Terminated', user, {
        actionBy: interaction.user.tag,
        color: '#ff0000',
        reason: reason,
        additional: { 'Roles Removed': rolesToRemove.length }
    });
    
    // Send termination DM
    try {
        const terminationEmbed = new EmbedBuilder()
            .setTitle('Staff Termination Notice')
            .setDescription('Your staff position has been terminated.')
            .setColor('#ff0000')
            .addFields(
                { name: 'Reason', value: reason },
                { name: 'Date', value: `<t:${Math.floor(Date.now() / 1000)}:f>` }
            );
        
        await user.send({ embeds: [terminationEmbed] });
    } catch (error) {
        console.error('Could not send termination DM:', error);
    }
    
    await interaction.reply({
        content: `Terminated ${user.tag}. Removed ${rolesToRemove.length} staff roles.`,
        ephemeral: true
    });
}

// LOA Command Handler
async function handleLoaCommand(interaction, config) {
    if (!hasPermission(interaction.member, 'staff', config)) {
        return interaction.reply({ content: 'You need staff permissions to request LOA.', ephemeral: true });
    }
    
    const duration = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason');
    
    // Check for existing active LOA
    const existingLoa = await db.collection('loa').findOne({
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        status: 'pending'
    });
    
    if (existingLoa) {
        return interaction.reply({ content: 'You already have a pending LOA request.', ephemeral: true });
    }
    
    // Create LOA request
    const loaRequest = {
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        duration: duration,
        reason: reason,
        requestedAt: new Date(),
        status: 'pending'
    };
    
    await db.collection('loa').insertOne(loaRequest);
    
    // Notify HR
    await logAction(interaction.guild, 'LOA Requested', interaction.user, {
        actionBy: interaction.user.tag,
        color: '#ffaa00',
        reason: reason,
        additional: { 'Duration': duration }
    });
    
    await interaction.reply({
        content: 'Your LOA request has been submitted and is pending HR approval.',
        ephemeral: true
    });
}

// LOA Management Handler
async function handleLoaManageCommand(interaction, config) {
    if (!hasPermission(interaction.member, 'hr', config)) {
        return interaction.reply({ content: 'You need HR permissions to manage LOA requests.', ephemeral: true });
    }
    
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'approve') {
        const user = interaction.options.getUser('user');
        
        const updated = await db.collection('loa').updateOne(
            { userId: user.id, guildId: interaction.guild.id, status: 'pending' },
            { 
                $set: { 
                    status: 'approved', 
                    approvedBy: interaction.user.id, 
                    approvedAt: new Date() 
                } 
            }
        );
        
        if (updated.matchedCount === 0) {
            return interaction.reply({ content: 'No pending LOA found for that user.', ephemeral: true });
        }
        
        await logAction(interaction.guild, 'LOA Approved', user, {
            actionBy: interaction.user.tag,
            color: '#00ff00'
        });
        
        // Notify user
        try {
            await user.send('Your LOA request has been approved. Take the time you need!');
        } catch (error) {
            console.error('Could not send LOA approval DM:', error);
        }
        
        await interaction.reply({ content: `Approved LOA for ${user.tag}.`, ephemeral: true });
        
    } else if (subcommand === 'deny') {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        
        const updated = await db.collection('loa').updateOne(
            { userId: user.id, guildId: interaction.guild.id, status: 'pending' },
            { 
                $set: { 
                    status: 'denied', 
                    deniedBy: interaction.user.id, 
                    deniedAt: new Date(),
                    denialReason: reason
                } 
            }
        );
        
        if (updated.matchedCount === 0) {
            return interaction.reply({ content: 'No pending LOA found for that user.', ephemeral: true });
        }
        
        await logAction(interaction.guild, 'LOA Denied', user, {
            actionBy: interaction.user.tag,
            color: '#ff0000',
            reason: reason
        });
        
        // Notify user
        try {
            await user.send(`Your LOA request has been denied. Reason: ${reason}`);
        } catch (error) {
            console.error('Could not send LOA denial DM:', error);
        }
        
        await interaction.reply({ content: `Denied LOA for ${user.tag}.`, ephemeral: true });
        
    } else if (subcommand === 'list') {
        const activeLoas = await db.collection('loa')
            .find({ guildId: interaction.guild.id, status: 'approved' })
            .toArray();
        
        if (activeLoas.length === 0) {
            return interaction.reply({ content: 'No active LOAs.', ephemeral: true });
        }
        
        const embed = new EmbedBuilder()
            .setTitle('Active Leave of Absence')
            .setColor('#ffaa00');
        
        for (const loa of activeLoas) {
            const user = await client.users.fetch(loa.userId);
            embed.addFields({
                name: user.tag,
                value: `**Duration:** ${loa.duration}\n**Reason:** ${loa.reason}\n**Approved:** <t:${Math.floor(loa.approvedAt.getTime() / 1000)}:R>`,
                inline: true
            });
        }
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

// Promote Command Handler
async function handlePromoteCommand(interaction, config) {
    if (!hasPermission(interaction.member, 'admin', config)) {
        return interaction.reply({ content: 'You need admin permissions to promote staff.', ephemeral: true });
    }
    
    const user = interaction.options.getUser('user');
    const role = interaction.options.getString('role');
    const roleId = config.roles[role];
    
    if (!roleId) {
        return interaction.reply({ content: `${role} role not configured.`, ephemeral: true });
    }
    
    const member = await interaction.guild.members.fetch(user.id);
    
    // Remove lower roles and add new role
    const rolesToRemove = [];
    if (role === 'hr' || role === 'admin') {
        if (config.roles.staff && member.roles.cache.has(config.roles.staff)) {
            rolesToRemove.push(config.roles.staff);
        }
    }
    if (role === 'admin') {
        if (config.roles.hr && member.roles.cache.has(config.roles.hr)) {
            rolesToRemove.push(config.roles.hr);
        }
    }
    
    if (rolesToRemove.length > 0) {
        await member.roles.remove(rolesToRemove);
    }
    await member.roles.add(roleId);
    
    await logAction(interaction.guild, 'Staff Promoted', user, {
        actionBy: interaction.user.tag,
        color: '#00ff00',
        additional: { 'New Role': role }
    });
    
    await interaction.reply({ content: `Promoted ${user.tag} to ${role}.`, ephemeral: true });
}

// Demote Command Handler
async function handleDemoteCommand(interaction, config) {
    if (!hasPermission(interaction.member, 'admin', config)) {
        return interaction.reply({ content: 'You need admin permissions to demote staff.', ephemeral: true });
    }
    
    const user = interaction.options.getUser('user');
    const member = await interaction.guild.members.fetch(user.id);
    
    // Remove all staff roles except basic staff
    const rolesToRemove = [];
    if (config.roles.admin && member.roles.cache.has(config.roles.admin)) {
        rolesToRemove.push(config.roles.admin);
    }
    if (config.roles.hr && member.roles.cache.has(config.roles.hr)) {
        rolesToRemove.push(config.roles.hr);
    }
    
    if (rolesToRemove.length > 0) {
        await member.roles.remove(rolesToRemove);
        
        // Add basic staff role if not present
        if (config.roles.staff && !member.roles.cache.has(config.roles.staff)) {
            await member.roles.add(config.roles.staff);
        }
    }
    
    await logAction(interaction.guild, 'Staff Demoted', user, {
        actionBy: interaction.user.tag,
        color: '#ff9900',
        additional: { 'Roles Removed': rolesToRemove.length }
    });
    
    await interaction.reply({ content: `Demoted ${user.tag} to basic staff.`, ephemeral: true });
}

// Announce Command Handler
async function handleAnnounceCommand(interaction, config) {
    if (!hasPermission(interaction.member, 'hr', config)) {
        return interaction.reply({ content: 'You need HR permissions to make announcements.', ephemeral: true });
    }
    
    const message = interaction.options.getString('message');
    const channel = interaction.options.getChannel('channel') || 
                   interaction.guild.channels.cache.get(config.channels.announcements) || 
                   interaction.channel;
    const pingRole = interaction.options.getRole('ping');
    
    const embed = new EmbedBuilder()
        .setTitle('📢 Staff Announcement')
        .setDescription(message)
        .setColor('#3498db')
        .setFooter({ text: `Announced by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();
    
    const content = pingRole ? `${pingRole}` : '';
    
    await channel.send({ content, embeds: [embed] });
    await interaction.reply({ content: `Announcement sent to ${channel}.`, ephemeral: true });
}

// Feedback Command Handler
async function handleFeedbackCommand(interaction, config) {
    const message = interaction.options.getString('message');
    const anonymous = interaction.options.getBoolean('anonymous') || false;
    
    const feedback = {
        guildId: interaction.guild.id,
        message: message,
        anonymous: anonymous,
        submittedBy: anonymous ? null : interaction.user.id,
        submittedAt: new Date()
    };
    
    await db.collection('feedback').insertOne(feedback);
    
    // Send to feedback channel
    const feedbackChannel = interaction.guild.channels.cache.get(config.channels.feedback);
    if (feedbackChannel) {
        const embed = new EmbedBuilder()
            .setTitle('💬 New Staff Feedback')
            .setDescription(message)
            .setColor('#9b59b6')
            .addFields({
                name: 'Submitted By',
                value: anonymous ? 'Anonymous' : interaction.user.tag,
                inline: true
            })
            .setTimestamp();
        
        await feedbackChannel.send({ embeds: [embed] });
    }
    
    await interaction.reply({ content: 'Thank you for your feedback!', ephemeral: true });
}

// Activity Logging Handler
async function handleLogActivityCommand(interaction, config) {
    if (!hasPermission(interaction.member, 'staff', config)) {
        return interaction.reply({ content: 'You need staff permissions to log activity.', ephemeral: true });
    }
    
    const activity = interaction.options.getString('activity');
    const hours = interaction.options.getInteger('hours') || 0;
    
    const activityLog = {
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        activity: activity,
        hours: hours,
        loggedAt: new Date()
    };
    
    await db.collection('activity').insertOne(activityLog);
    
    await interaction.reply({
        content: `Activity logged: ${activity}${hours > 0 ? ` (${hours} hours)` : ''}`,
        ephemeral: true
    });
}

// Staff Report Handler
async function handleStaffReportCommand(interaction, config) {
    if (!hasPermission(interaction.member, 'hr', config)) {
        return interaction.reply({ content: 'You need HR permissions to view staff reports.', ephemeral: true });
    }
    
    const user = interaction.options.getUser('user');
    const period = interaction.options.getString('period') || 'week';
    
    let startDate = new Date();
    switch (period) {
        case 'today':
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'week':
            startDate.setDate(startDate.getDate() - 7);
            break;
        case 'month':
            startDate.setMonth(startDate.getMonth() - 1);
            break;
    }
    
    const query = {
        guildId: interaction.guild.id,
        loggedAt: { $gte: startDate }
    };
    
    if (user) {
        query.userId = user.id;
    }
    
    const activities = await db.collection('activity')
        .find(query)
        .sort({ loggedAt: -1 })
        .limit(20)
        .toArray();
    
    if (activities.length === 0) {
        return interaction.reply({
            content: `No activity found for the specified ${period}.`,
            ephemeral: true
        });
    }
    
    const embed = new EmbedBuilder()
        .setTitle(`Staff Activity Report - ${period}`)
        .setColor('#2ecc71')
        .setTimestamp();
    
    if (user) {
        embed.setDescription(`Activity for ${user.tag}`);
    }
    
    // Group by user if not specific user
    if (!user) {
        const userActivities = {};
        for (const activity of activities) {
            if (!userActivities[activity.userId]) {
                userActivities[activity.userId] = { count: 0, hours: 0 };
            }
            userActivities[activity.userId].count++;
            userActivities[activity.userId].hours += activity.hours;
        }
        
        for (const [userId, data] of Object.entries(userActivities)) {
            const u = await client.users.fetch(userId);
            embed.addFields({
                name: u.tag,
                value: `${data.count} activities, ${data.hours} hours`,
                inline: true
            });
        }
    } else {
        // Show individual activities for specific user
        const totalHours = activities.reduce((sum, a) => sum + a.hours, 0);
        embed.addFields({ name: 'Total Hours', value: totalHours.toString(), inline: true });
        
        activities.slice(0, 10).forEach((activity, index) => {
            embed.addFields({
                name: `Activity ${index + 1}`,
                value: `${activity.activity}${activity.hours > 0 ? ` (${activity.hours}h)` : ''}\n<t:${Math.floor(activity.loggedAt.getTime() / 1000)}:R>`,
                inline: false
            });
        });
    }
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Tag Command Handler
async function handleTagCommand(interaction, config) {
    const tagName = interaction.options.getString('name');
    
    const tag = await db.collection('tags').findOne({
        name: tagName,
        guildId: interaction.guild.id
    });
    
    if (!tag) {
        return interaction.reply({ content: 'Tag not found.', ephemeral: true });
    }
    
    await interaction.reply(tag.content);
}

// Tag Management Handler
async function handleTagManageCommand(interaction, config) {
    if (!hasPermission(interaction.member, 'hr', config)) {
        return interaction.reply({ content: 'You need HR permissions to manage tags.', ephemeral: true });
    }
    
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'create') {
        const name = interaction.options.getString('name');
        const content = interaction.options.getString('content');
        
        const existing = await db.collection('tags').findOne({
            name: name,
            guildId: interaction.guild.id
        });
        
        if (existing) {
            return interaction.reply({ content: 'A tag with that name already exists.', ephemeral: true });
        }
        
        await db.collection('tags').insertOne({
            name: name,
            content: content,
            guildId: interaction.guild.id,
            createdBy: interaction.user.id,
            createdAt: new Date()
        });
        
        await interaction.reply({ content: `Tag "${name}" created successfully.`, ephemeral: true });
        
    } else if (subcommand === 'delete') {
        const name = interaction.options.getString('name');
        
        const result = await db.collection('tags').deleteOne({
            name: name,
            guildId: interaction.guild.id
        });
        
        if (result.deletedCount === 0) {
            return interaction.reply({ content: 'Tag not found.', ephemeral: true });
        }
        
        await interaction.reply({ content: `Tag "${name}" deleted successfully.`, ephemeral: true });
        
    } else if (subcommand === 'list') {
        const tags = await db.collection('tags')
            .find({ guildId: interaction.guild.id })
            .sort({ name: 1 })
            .toArray();
        
        if (tags.length === 0) {
            return interaction.reply({ content: 'No tags found.', ephemeral: true });
        }
        
        const embed = new EmbedBuilder()
            .setTitle('Available Tags')
            .setColor('#3498db')
            .setDescription(tags.map(tag => `\`${tag.name}\``).join(', '));
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

// Eval Command Handler (Owner Only)
async function handleEvalCommand(interaction, config) {
    // Check if user is bot owner
    if (interaction.user.id !== process.env.OWNER_ID) {
        return interaction.reply({ content: 'This command is restricted to the bot owner.', ephemeral: true });
    }
    
    const code = interaction.options.getString('code');
    
    try {
        let result = eval(code);
        
        if (typeof result !== 'string') {
            result = require('util').inspect(result, { depth: 0 });
        }
        
        if (result.length > 1900) {
            result = result.substring(0, 1900) + '...';
        }
        
        await interaction.reply({
            content: `\`\`\`js\n${result}\n\`\`\``,
            ephemeral: true
        });
    } catch (error) {
        await interaction.reply({
            content: `\`\`\`js\n${error.toString()}\n\`\`\``,
            ephemeral: true
        });
    }
}

// On-Call System Handler
async function handleOnCallCommand(interaction, config) {
    if (!hasPermission(interaction.member, 'staff', config)) {
        return interaction.reply({ content: 'You need staff permissions to use the on-call system.', ephemeral: true });
    }
    
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'set') {
        await db.collection('oncall').updateOne(
            { userId: interaction.user.id, guildId: interaction.guild.id },
            { 
                $set: { 
                    userId: interaction.user.id,
                    guildId: interaction.guild.id,
                    setAt: new Date(),
                    active: true
                } 
            },
            { upsert: true }
        );
        
        await interaction.reply({ content: 'You are now marked as on-call.', ephemeral: true });
        
    } else if (subcommand === 'unset') {
        await db.collection('oncall').updateOne(
            { userId: interaction.user.id, guildId: interaction.guild.id },
            { $set: { active: false, unsetAt: new Date() } }
        );
        
        await interaction.reply({ content: 'You are no longer on-call.', ephemeral: true });
        
    } else if (subcommand === 'list') {
        const onCallStaff = await db.collection('oncall')
            .find({ guildId: interaction.guild.id, active: true })
            .toArray();
        
        if (onCallStaff.length === 0) {
            return interaction.reply({ content: 'No staff members are currently on-call.', ephemeral: true });
        }
        
        const embed = new EmbedBuilder()
            .setTitle('Staff On-Call')
            .setColor('#e74c3c');
        
        for (const staff of onCallStaff) {
            const user = await client.users.fetch(staff.userId);
            embed.addFields({
                name: user.tag,
                value: `Since: <t:${Math.floor(staff.setAt.getTime() / 1000)}:R>`,
                inline: true
            });
        }
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

// Modal Submit Handler
async function handleModalSubmit(interaction) {
    if (interaction.customId === 'staff_application') {
        const name = interaction.fields.getTextInputValue('applicant_name');
        const age = interaction.fields.getTextInputValue('applicant_age');
        const experience = interaction.fields.getTextInputValue('applicant_experience');
        const motivation = interaction.fields.getTextInputValue('applicant_motivation');
        const availability = interaction.fields.getTextInputValue('applicant_availability');
        
        // Store application in database
        const application = {
            userId: interaction.user.id,
            guildId: interaction.guild.id,
            name: name,
            age: age,
            experience: experience,
            motivation: motivation,
            availability: availability,
            submittedAt: new Date(),
            status: 'pending'
        };
        
        await db.collection('applications').insertOne(application);
        
        // Send to applications channel
        const config = await getGuildConfig(interaction.guild.id);
        const appChannel = interaction.guild.channels.cache.get(config.channels.applications);
        
        if (appChannel) {
            const embed = new EmbedBuilder()
                .setTitle('📋 New Staff Application')
                .setColor('#3498db')
                .setThumbnail(interaction.user.displayAvatarURL())
                .addFields(
                    { name: 'Applicant', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                    { name: 'Name', value: name, inline: true },
                    { name: 'Age', value: age, inline: true },
                    { name: 'Experience', value: experience, inline: false },
                    { name: 'Motivation', value: motivation, inline: false },
                    { name: 'Availability', value: availability, inline: false }
                )
                .setTimestamp();
            
            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`approve_app_${interaction.user.id}`)
                        .setLabel('Approve')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`deny_app_${interaction.user.id}`)
                        .setLabel('Deny')
                        .setStyle(ButtonStyle.Danger)
                );
            
            await appChannel.send({ embeds: [embed], components: [buttons] });
        }
        
        await interaction.reply({
            content: 'Your application has been submitted! HR will review it shortly.',
            ephemeral: true
        });
    }
}

// Button Interaction Handler
async function handleButtonInteraction(interaction) {
    const config = await getGuildConfig(interaction.guild.id);
    
    if (!hasPermission(interaction.member, 'hr', config)) {
        return interaction.reply({ content: 'You need HR permissions to manage applications.', ephemeral: true });
    }
    
    if (interaction.customId.startsWith('approve_app_')) {
        const userId = interaction.customId.split('_')[2];
        // Show role selection for approval
        const modal = new ModalBuilder()
            .setCustomId(`approve_modal_${userId}`)
            .setTitle('Approve Application');
        
        const roleInput = new TextInputBuilder()
            .setCustomId('role_selection')
            .setLabel('Role to assign (staff/hr)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue('staff');
        
        modal.addComponents(new ActionRowBuilder().addComponents(roleInput));
        await interaction.showModal(modal);
        
    } else if (interaction.customId.startsWith('deny_app_')) {
        const userId = interaction.customId.split('_')[2];
        const modal = new ModalBuilder()
            .setCustomId(`deny_modal_${userId}`)
            .setTitle('Deny Application');
        
        const reasonInput = new TextInputBuilder()
            .setCustomId('denial_reason')
            .setLabel('Reason for denial')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);
        
        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        await interaction.showModal(modal);
        
    } else if (interaction.customId.startsWith('approve_modal_')) {
        const userId = interaction.customId.split('_')[2];
        const role = interaction.fields.getTextInputValue('role_selection');
        
        const user = await client.users.fetch(userId);
        const member = await interaction.guild.members.fetch(userId);
        const roleId = config.roles[role];
        
        if (!roleId) {
            return interaction.reply({ content: `${role} role not configured.`, ephemeral: true });
        }
        
        await member.roles.add(roleId);
        
        // Update application
        await db.collection('applications').updateOne(
            { userId: userId, guildId: interaction.guild.id, status: 'pending' },
            { $set: { status: 'approved', approvedBy: interaction.user.id, approvedAt: new Date() } }
        );
        
        // Update the message
        await interaction.update({
            content: `✅ Application approved by ${interaction.user.tag} - ${role} role assigned`,
            embeds: interaction.message.embeds,
            components: []
        });
        
        // Send welcome DM
        try {
            await user.send(`🎉 Congratulations! Your staff application has been approved. You've been assigned the ${role} role.`);
        } catch (error) {
            console.error('Could not send approval DM:', error);
        }
        
        await logAction(interaction.guild, 'Application Approved', user, {
            actionBy: interaction.user.tag,
            color: '#00ff00',
            additional: { 'Role Assigned': role }
        });
        
    } else if (interaction.customId.startsWith('deny_modal_')) {
        const userId = interaction.customId.split('_')[2];
        const reason = interaction.fields.getTextInputValue('denial_reason');
        
        const user = await client.users.fetch(userId);
        
        // Update application
        await db.collection('applications').updateOne(
            { userId: userId, guildId: interaction.guild.id, status: 'pending' },
            { $set: { status: 'denied', deniedBy: interaction.user.id, deniedAt: new Date(), denialReason: reason } }
        );
        
        // Update the message
        await interaction.update({
            content: `❌ Application denied by ${interaction.user.tag}`,
            embeds: interaction.message.embeds,
            components: []
        });
        
        // Send denial DM
        try {
            await user.send(`Your staff application has been reviewed. Unfortunately, it was not approved at this time.\n\nFeedback: ${reason}`);
        } catch (error) {
            console.error('Could not send denial DM:', error);
        }
        
        await logAction(interaction.guil
