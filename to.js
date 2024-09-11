const fs = require('fs');
const axios = require('axios');
const readline = require('readline');
const colors = require('colors');
const { parse } = require('querystring');
const { DateTime } = require('luxon');

class Tomarket {
    constructor() {
        this.headers = {
            'host': 'api-web.tomarket.ai',
            'connection': 'keep-alive',
            'accept': 'application/json, text/plain, */*',
            'user-agent': "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
            'content-type': 'application/json',
            'origin': 'https://mini-app.tomarket.ai',
            'x-requested-with': 'tw.nekomimi.nekogram',
            'sec-fetch-site': 'same-site',
            'sec-fetch-mode': 'cors',
            'sec-fetch-dest': 'empty',
            'referer': 'https://mini-app.tomarket.ai/',
            'accept-language': 'en-US,en;q=0.9'
        };

        this.interval = 3;
        this.playGame = true;
        this.gameLowPoint = 300;
        this.gameHighPoint = 450;
    }

    setAuthorization(auth) {
        this.headers['authorization'] = auth;
    }

    delAuthorization() {
        delete this.headers['authorization'];
    }

    async login(data) {
        const url = 'https://api-web.tomarket.ai/tomarket-game/v1/user/login';
        const cleanedData = data.replace(/\r/g, '');
        const requestData = {
            init_data: cleanedData,
            invite_code: ''
        };
        
        this.delAuthorization();
        try {
            const res = await this.http(url, this.headers, JSON.stringify(requestData));
            if (res.status !== 200) {
                this.log(colors.red(`Login failed! Status code: ${res.status}`));
                return null;
            }
            const token = res.data.data.access_token;
            return token;
        } catch (error) {
            this.log(colors.red(`Error during login: ${error.message}`));
            return null;
        }
    }

    async startFarming() {
        const data = JSON.stringify({ game_id: '53b22103-c7ff-413d-bc63-20f6fb806a07' });
        const url = 'https://api-web.tomarket.ai/tomarket-game/v1/farm/start';
        const res = await this.http(url, this.headers, data);
        if (res.status !== 200) {
            this.log(colors.red('Unable to start farming!'));
            return false;
        }
        const endFarming = res.data.data.end_at;
        const formatEndFarming = DateTime.fromMillis(endFarming).toISO().split('.')[0];
        this.log(colors.green('Started farming...'));
    }

    async endFarming() {
        const data = JSON.stringify({ game_id: '53b22103-c7ff-413d-bc63-20f6fb806a07' });
        const url = 'https://api-web.tomarket.ai/tomarket-game/v1/farm/claim';
        const res = await this.http(url, this.headers, data);
        if (res.status !== 200) {
            this.log(colors.red('Unable to harvest tomatoes!'));
            return false;
        }
        const poin = res.data.data.claim_this_time;
        this.log(colors.green('Tomatoes harvested'));
        this.log(colors.green('Reward: ') + colors.white(poin));
    }

    async dailyClaim() {
        const url = 'https://api-web.tomarket.ai/tomarket-game/v1/daily/claim';
        const data = JSON.stringify({ game_id: 'fa873d13-d831-4d6f-8aee-9cff7a1d0db1' });
        const res = await this.http(url, this.headers, data);
        if (res.status !== 200) {
            this.log(colors.red('Unable to claim daily bonus!'));
            return false;
        }

        const responseData = res.data.data;
        if (typeof responseData === 'string') {
            return false;
        }

        const poin = responseData.today_points;
        this.log(colors.green('Daily bonus claimed successfully, reward: ') + colors.white(poin));
        return true;
    }

    async playGameFunc(amountPass) {
        const dataGame = JSON.stringify({ game_id: '59bcd12e-04e2-404c-a172-311a0084587d' });
        const startUrl = 'https://api-web.tomarket.ai/tomarket-game/v1/game/play';
        const claimUrl = 'https://api-web.tomarket.ai/tomarket-game/v1/game/claim';
        for (let i = 0; i < amountPass; i++) {
            const res = await this.http(startUrl, this.headers, dataGame);
            if (res.status !== 200) {
                this.log(colors.red('Unable to start the game'));
                return;
            }
            this.log(colors.green('Starting game...'));
            await this.countdown(30);
            const point = this.randomInt(this.gameLowPoint, this.gameHighPoint);
            const dataClaim = JSON.stringify({ game_id: '59bcd12e-04e2-404c-a172-311a0084587d', points: point });
            const resClaim = await this.http(claimUrl, this.headers, dataClaim);
            if (resClaim.status !== 200) {
                this.log(colors.red('Error claiming tomatoes in-game'));
                continue;
            }
            this.log(colors.green('Tomatoes earned: ') + colors.white(point));
        }
    }

    async getBalance() {
        const url = 'https://api-web.tomarket.ai/tomarket-game/v1/user/balance';
        while (true) {
            const res = await this.http(url, this.headers, '{}');
            const data = res.data.data;
            if (!data) {
                this.log(colors.red('Failed to retrieve data'));
                return null;
            }

            const timestamp = data.timestamp;
            const balance = data.available_balance;
            this.log(colors.green('Balance: ') + colors.white(balance));

            if (!data.daily) {
                await this.dailyClaim();
                continue;
            }

            const lastCheckTs = data.daily.last_check_ts;
            if (DateTime.now().toSeconds() > lastCheckTs + 24 * 60 * 60) {
                await this.dailyClaim();
            }

            if (!data.farming) {
                this.log(colors.yellow('Farming not started yet'));
                await this.startFarming();
                continue;
            }

            const endFarming = data.farming.end_at;
            const formatEndFarming = DateTime.fromMillis(endFarming * 1000).toISO().split('.')[0];
            if (timestamp > endFarming) {
                await this.endFarming();
                continue;
            }

            this.log(colors.yellow('Farming completion time: ') + colors.white(formatEndFarming));

            if (this.playGame) {
                const playPass = data.play_passes;
                this.log(colors.green('Game passes: ') + colors.white(playPass));
                if (parseInt(playPass) > 0) {
                    await this.playGameFunc(playPass);
                    continue;
                }
            }

            const next = endFarming - timestamp;
            return next;
        }
    }

    loadData(file) {
        const datas = fs.readFileSync(file, 'utf8')
            .split('\n')
            .filter(line => line.trim() !== '');
        if (datas.length <= 0) {
            console.log(colors.red(`No data found`));
            process.exit();
        }
        return datas;
    }

    save(id, token) {
        const tokens = JSON.parse(fs.readFileSync('token.json', 'utf8'));
        tokens[id] = token;
        fs.writeFileSync('token.json', JSON.stringify(tokens, null, 4));
    }

    get(id) {
        const tokens = JSON.parse(fs.readFileSync('token.json', 'utf8'));
        return tokens[id] || null;
    }

    isExpired(token) {
        const [header, payload, sign] = token.split('.');
        const decodedPayload = Buffer.from(payload, 'base64').toString();
        
        try {
            const parsedPayload = JSON.parse(decodedPayload);
            const now = Math.floor(DateTime.now().toSeconds());
            
            if (parsedPayload.exp) {
                const expirationDate = DateTime.fromSeconds(parsedPayload.exp).toLocal();
                this.log(colors.cyan(`Token expires at: ${expirationDate.toFormat('yyyy-MM-dd HH:mm:ss')}`));
                
                const isExpired = now > parsedPayload.exp;
                this.log(colors.cyan(`Is the token expired? ${isExpired ? 'Yes, please refresh the token' : 'No, keep using it'}`));
                
                return isExpired;
            } else {
                this.log(colors.yellow(`Eternal token, no expiration time`));
                return false;
            }
        } catch (error) {
            this.error(colors.red(`Error: ${error.message}`));
            return true;
        }
    }

    async http(url, headers, data = null) {
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
            try {
                const now = DateTime.now().toISO().split('.')[0];
                let response;
                if (data) {
                    response = await axios.post(url, data, { headers });
                } else {
                    response = await axios.get(url, { headers });
                }
                this.log(colors.cyan(`Request made to ${url} at ${now}`));
                return response;
            } catch (error) {
                retryCount++;
                this.log(colors.red(`Error on attempt ${retryCount}: ${error.message}`));
                await this.countdown(this.randomInt(2, 6));
            }
        }
    }

    log(msg) {
        const now = DateTime.now().toISO().split('.')[0];
        console.log(colors.white(`[${now}] `) + msg);
    }

    async countdown(seconds) {
        for (let i = seconds; i > 0; i--) {
            this.log(colors.yellow(`${i} seconds remaining`));
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1) + min);
    }

    async main() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question('Enter the file name: ', async (file) => {
            const datas = this.loadData(file);
            for (const data of datas) {
                this.log(colors.yellow(`Current data being processed: ${data}`));
                const id = data.split(':')[0];
                let token = this.get(id);
                if (!token || this.isExpired(token)) {
                    this.log(colors.yellow('Token expired, starting login process...'));
                    token = await this.login(data);
                    if (!token) continue;
                    this.save(id, token);
                }
                this.setAuthorization(token);
                const waitTime = await this.getBalance();
                this.log(colors.green(`Done, waiting for the next farming: ${waitTime} seconds`));
                await this.countdown(waitTime);
            }
            rl.close();
        });
    }
}

const app = new Tomarket();
app.main();
