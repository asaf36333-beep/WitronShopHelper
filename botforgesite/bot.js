const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');

// ==================== KONFİGÜRASYON ====================
const TOKEN = 'MTQ3OTYxMjY3NTMyMjU0ODMzNw.GmbYms.JaY4TeUVx9j7WIEmE7rOycFGjWSAW399iCdGes';
const KEY2_ROLE_ID = '1479785945967624202';
const DISCORD_INVITE = 'https://discord.gg/ZGvruFGDMK';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'botforge-gizli-anahtar',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ==================== VERİTABANI ====================
let activeKeys = new Map();
let key2Keys = new Map();
let userCooldowns = new Map();
let users = new Map();
let userBots = new Map();
let purchasedPackages = new Map();

let stats = {
    totalKeys: 0,
    totalKeys2: 0,
    totalLogins: 0,
    totalUsers: 0,
    totalBots: 0,
    startTime: new Date()
};

// ==================== PAKETLER ====================
const packages = {
    free: {
        name: 'Ücretsiz',
        price: 0,
        botLimit: 1,
        slashLimit: 5,
        features: ['1 Bot', 'Temel komutlar', 'Topluluk desteği', '5 Slash komutu']
    },
    pro: {
        name: 'Pro',
        price: 49,
        botLimit: 5,
        slashLimit: 999,
        features: ['5 Bot', 'Sınırsız komut', 'Öncelikli destek', 'Özel prefix', 'Dashboard erişimi', 'API erişimi']
    },
    enterprise: {
        name: 'Enterprise',
        price: 149,
        botLimit: 999,
        slashLimit: 999,
        features: ['Sınırsız Bot', 'Sınırsız komut', '7/24 Destek', 'Beyaz etiket', 'Özel sunucu', 'Gelişmiş API']
    }
};

// ==================== KEY ÜRETİCİ ====================
function generateKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = '';
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            key += chars[Math.floor(Math.random() * chars.length)];
        }
        if (i < 3) key += '-';
    }
    return key;
}

function generateKey2() {
    return 'KEY2-' + generateKey();
}

function generateUserId() {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ==================== API ENDPOINT'LER ====================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/discord', (req, res) => {
    res.json({ invite: DISCORD_INVITE });
});

app.get('/api/keys', (req, res) => {
    const normal = Array.from(activeKeys.entries()).map(([key, val]) => ({
        key,
        username: val.username,
        userId: val.userId,
        createdAt: val.createdAt,
        expiresAt: val.expiresAt
    }));
    
    const special = Array.from(key2Keys.entries()).map(([key, val]) => ({
        key,
        username: val.username,
        userId: val.userId,
        createdAt: val.createdAt
    }));
    
    res.json({ 
        normal, 
        special, 
        stats: {
            totalKeys: stats.totalKeys,
            totalKeys2: stats.totalKeys2,
            totalLogins: stats.totalLogins,
            totalUsers: stats.totalUsers,
            totalBots: stats.totalBots,
            uptime: Math.floor((Date.now() - stats.startTime) / 1000)
        }
    });
});

app.get('/api/verify/:key', (req, res) => {
    const key = req.params.key;
    
    let userInfo = null;
    let keyType = null;
    
    if (activeKeys.has(key)) {
        userInfo = activeKeys.get(key);
        activeKeys.delete(key);
        keyType = 'normal';
        stats.totalLogins++;
    } else if (key2Keys.has(key)) {
        userInfo = key2Keys.get(key);
        key2Keys.delete(key);
        keyType = 'vip';
        stats.totalLogins++;
    } else {
        return res.json({ success: false });
    }
    
    let userId = null;
    let user = null;
    
    for (let [id, u] of users) {
        if (u.discordId === userInfo.userId) {
            userId = id;
            user = u;
            break;
        }
    }
    
    if (!user) {
        userId = generateUserId();
        user = {
            id: userId,
            discordId: userInfo.userId,
            username: userInfo.username,
            joinedAt: new Date(),
            package: 'free',
            bots: [],
            purchases: []
        };
        users.set(userId, user);
        stats.totalUsers++;
    }
    
    req.session.userId = userId;
    req.session.username = user.username;
    req.session.package = user.package;
    
    res.json({ 
        success: true, 
        user: {
            id: userId,
            username: user.username,
            discordId: user.discordId,
            package: user.package,
            keyType: keyType
        }
    });
});

app.get('/api/session', (req, res) => {
    if (req.session.userId) {
        const user = users.get(req.session.userId);
        if (user) {
            return res.json({
                loggedIn: true,
                user: {
                    id: user.id,
                    username: user.username,
                    discordId: user.discordId,
                    package: user.package
                }
            });
        }
    }
    res.json({ loggedIn: false });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/packages', (req, res) => {
    res.json(packages);
});

app.post('/api/purchase/:packageId', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, error: 'Giriş yapmalısın' });
    }
    
    const packageId = req.params.packageId;
    const user = users.get(req.session.userId);
    
    if (!user) {
        return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
    }
    
    if (!packages[packageId]) {
        return res.status(404).json({ success: false, error: 'Paket bulunamadı' });
    }
    
    const purchase = {
        packageId,
        packageName: packages[packageId].name,
        price: packages[packageId].price,
        purchasedAt: new Date()
    };
    
    user.purchases.push(purchase);
    user.package = packageId;
    req.session.package = packageId;
    
    res.json({ 
        success: true, 
        package: packages[packageId],
        user: {
            id: user.id,
            username: user.username,
            package: user.package
        }
    });
});

app.get('/api/user/bots', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, error: 'Giriş yapmalısın' });
    }
    
    const user = users.get(req.session.userId);
    if (!user) {
        return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
    }
    
    const bots = user.bots.map(botId => userBots.get(botId)).filter(b => b);
    
    res.json({ success: true, bots });
});

app.post('/api/user/bots', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, error: 'Giriş yapmalısın' });
    }
    
    const { name, description, template } = req.body;
    const user = users.get(req.session.userId);
    
    if (!user) {
        return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı' });
    }
    
    const package = packages[user.package] || packages.free;
    if (user.bots.length >= package.botLimit) {
        return res.status(400).json({ 
            success: false, 
            error: `Bot limitine ulaştın (${package.botLimit}). Daha fazla bot için paket yükselt.`
        });
    }
    
    const botId = 'bot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    
    const bot = {
        id: botId,
        name: name || 'İsimsiz Bot',
        description: description || '',
        template: template || 'custom',
        ownerId: user.id,
        ownerUsername: user.username,
        createdAt: new Date(),
        token: null,
        status: 'stopped',
        commands: [],
        settings: {
            prefix: '!',
            slashCommands: true
        }
    };
    
    userBots.set(botId, bot);
    user.bots.push(botId);
    stats.totalBots++;
    
    res.json({ success: true, bot });
});

app.put('/api/user/bots/:botId', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, error: 'Giriş yapmalısın' });
    }
    
    const botId = req.params.botId;
    const bot = userBots.get(botId);
    
    if (!bot) {
        return res.status(404).json({ success: false, error: 'Bot bulunamadı' });
    }
    
    if (bot.ownerId !== req.session.userId) {
        return res.status(403).json({ success: false, error: 'Bu bot sana ait değil' });
    }
    
    const { name, description, token, status, commands, settings } = req.body;
    
    if (name) bot.name = name;
    if (description) bot.description = description;
    if (token !== undefined) bot.token = token;
    if (status) bot.status = status;
    if (commands) bot.commands = commands;
    if (settings) bot.settings = { ...bot.settings, ...settings };
    
    userBots.set(botId, bot);
    
    res.json({ success: true, bot });
});

app.delete('/api/user/bots/:botId', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, error: 'Giriş yapmalısın' });
    }
    
    const botId = req.params.botId;
    const bot = userBots.get(botId);
    
    if (!bot) {
        return res.status(404).json({ success: false, error: 'Bot bulunamadı' });
    }
    
    if (bot.ownerId !== req.session.userId) {
        return res.status(403).json({ success: false, error: 'Bu bot sana ait değil' });
    }
    
    const user = users.get(req.session.userId);
    if (user) {
        user.bots = user.bots.filter(id => id !== botId);
    }
    
    userBots.delete(botId);
    
    res.json({ success: true });
});

app.get('/api/templates', (req, res) => {
    const templates = [
        { id: 'moderasyon', name: 'ModerBot', description: 'Gelişmiş moderasyon sistemi', tags: ['Moderasyon', 'Auto-Mod'] },
        { id: 'muzik', name: 'MüzikBot', description: 'YouTube, Spotify müzik desteği', tags: ['Müzik', 'Eğlence'] },
        { id: 'ekonomi', name: 'EkoBot', description: 'Ekonomi ve seviye sistemi', tags: ['Ekonomi', 'Seviye'] },
        { id: 'ticket', name: 'TicketBot', description: 'Destek ticket sistemi', tags: ['Destek', 'Ticket'] },
        { id: 'welcome', name: 'WelcomeBot', description: 'Karşılama ve otorol sistemi', tags: ['Hoşgeldin', 'Otorol'] },
        { id: 'giveaway', name: 'GiveawayBot', description: 'Çekiliş ve etkinlik sistemi', tags: ['Çekiliş', 'Etkinlik'] }
    ];
    res.json(templates);
});

app.post('/api/admin/generate', (req, res) => {
    const { type } = req.body;
    
    if (type === 'key2') {
        const key = generateKey2();
        key2Keys.set(key, {
            username: 'Admin',
            userId: '000000',
            createdAt: new Date()
        });
        stats.totalKeys2++;
        res.json({ success: true, key });
    } else {
        const key = generateKey();
        activeKeys.set(key, {
            username: 'Admin',
            userId: '000000',
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 600000)
        });
        stats.totalKeys++;
        res.json({ success: true, key });
    }
});

app.delete('/api/admin/keys/:key', (req, res) => {
    const key = req.params.key;
    if (activeKeys.delete(key) || key2Keys.delete(key)) {
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// ==================== DISCORD BOT ====================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

client.once('ready', () => {
    console.log('\n═══════════════════════════════════════');
    console.log('✅ BOTFORGE AKTİF');
    console.log(`🤖 ${client.user.tag}`);
    console.log(`📢 !key, !key2, !davet`);
    console.log(`🌐 http://localhost:3000`);
    console.log('═══════════════════════════════════════\n');
    
    client.user.setActivity('!key | BotForge', { type: 'LISTENING' });
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content === '!davet') {
        const embed = new EmbedBuilder()
            .setColor(0x3b82f6)
            .setTitle('🎮 BotForge Discord Sunucusu')
            .setDescription('BotForge topluluğuna katıl!')
            .addFields(
                { name: '🔗 Davet Linki', value: DISCORD_INVITE },
                { name: '🎁 Faydalar', value: '• Destek al\n• Bot şablonları\n• Topluluk' }
            );
        return message.channel.send({ embeds: [embed] });
    }

    if (message.content === '!key') {
        const userId = message.author.id;
        const now = Date.now();

        if (userCooldowns.has(userId)) {
            const lastUsed = userCooldowns.get(userId);
            const timeLeft = 600000 - (now - lastUsed);
            
            if (timeLeft > 0) {
                const minutes = Math.floor(timeLeft / 60000);
                const seconds = Math.floor((timeLeft % 60000) / 1000);
                return message.reply(`⏳ ${minutes}dk ${seconds}sn sonra tekrar key alabilirsin.`);
            }
        }

        const newKey = generateKey();
        
        activeKeys.set(newKey, {
            username: message.author.tag,
            userId: message.author.id,
            createdAt: new Date(),
            expiresAt: new Date(now + 600000)
        });

        userCooldowns.set(userId, now);
        stats.totalKeys++;

        setTimeout(() => {
            activeKeys.delete(newKey);
        }, 600000);

        try {
            await message.author.send(
                `🔑 **BotForge Giriş Anahtarın**\n` +
                `\`\`\`${newKey}\`\`\`\n` +
                `🌐 http://localhost:3000\n` +
                `⏰ 10 dakika geçerli\n` +
                `🎮 Discord: ${DISCORD_INVITE}`
            );
            await message.channel.send(`✅ ${message.author}, DM'den key gönderdim!`);
        } catch {
            await message.channel.send(
                `✅ **Key:** \`${newKey}\`\n` +
                `🎮 **Discord:** ${DISCORD_INVITE}`
            );
        }
    }

    else if (message.content === '!key2') {
        if (!message.member.roles.cache.has(KEY2_ROLE_ID)) {
            return message.reply('❌ Bu komut için özel role sahip olmalısın!');
        }

        const newKey = generateKey2();
        
        key2Keys.set(newKey, {
            username: message.author.tag,
            userId: message.author.id,
            createdAt: new Date()
        });

        stats.totalKeys2++;

        try {
            await message.author.send(
                `👑 **VIP Giriş Anahtarın**\n` +
                `\`\`\`${newKey}\`\`\`\n` +
                `🌐 http://localhost:3000`
            );
            await message.channel.send(`✅ ${message.author}, VIP key DM'den gönderildi!`);
        } catch {
            await message.channel.send(`✅ VIP Key: \`${newKey}\``);
        }
    }

    else if (message.content === '!stats') {
        const uptime = Math.floor((Date.now() - stats.startTime) / 3600000);
        const embed = new EmbedBuilder()
            .setColor(0x3b82f6)
            .setTitle('BotForge İstatistikleri')
            .addFields(
                { name: '🔑 Normal Key', value: stats.totalKeys.toString(), inline: true },
                { name: '👑 VIP Key', value: stats.totalKeys2.toString(), inline: true },
                { name: '✅ Giriş', value: stats.totalLogins.toString(), inline: true },
                { name: '👤 Kullanıcı', value: stats.totalUsers.toString(), inline: true },
                { name: '🤖 Bot', value: stats.totalBots.toString(), inline: true },
                { name: '⏰ Çalışma', value: uptime + ' saat', inline: true }
            );
        message.channel.send({ embeds: [embed] });
    }
});

// ==================== SERVER'ı BAŞLAT ====================
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🌐 http://localhost:${PORT}`);
});

client.login(TOKEN).catch(() => {
    console.log('❌ Token hatalı!');
});

setInterval(() => {
    const now = Date.now();
    activeKeys.forEach((value, key) => {
        if (value.expiresAt < now) activeKeys.delete(key);
    });
}, 60000);