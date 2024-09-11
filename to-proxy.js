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
        this.proxies = this.loadProxies('proxy.txt');
    }

    setAuthorization(auth) {
        this.headers['authorization'] = auth;
    }

    delAuthorization() {
        delete this.headers['authorization'];
    }

    loadProxies(file) {
        const proxies = fs.readFileSync(file, 'utf8').split('\n').map(line => line.trim()).filter(line => line.length > 0);
        if (proxies.length <= 0) {
            console.log(colors.red(`No proxy found`));
            process.exit();
        }
        return proxies;
    }

    async login(data, proxy) {
        const url = 'https://api-web.tomarket.ai/tomarket-game/v1/user/login';
        const cleanedData = data.replace(/\r/g, '');
        const requestData = {
            init_data: cleanedData,
            invite_code: ''
        };
        
        this.delAuthorization();
        try {
            const res = await this.http(url, this.headers, JSON.stringify(requestData), proxy);
            if (res.status !== 200) {
                this.log(colors.red(`Login unsuccessful! Status code: ${res.status}`));
                return null;
            }
            const token = res.data.data.access_token;
            return token;
        } catch (error) {
            this.log(colors.red(`Error during login: ${error.message}`));
            return null;
        }
    }

    async startFarming(proxy) {
        const data = JSON.stringify({ game_id: '53b22103-c7ff-413d-bc63-20f6fb806a07' });
        const url = 'https://api-web.tomarket.ai/tomarket-game/v1/farm/start';
        const res = await this.http(url, this.headers, data, proxy);
        if (res.status !== 200) {
            this.log(colors.red('Unable to start farming!'));
            return false;
        }
        const endFarming = res.data.data.end_at;
        const formatEndFarming = DateTime.fromMillis(endFarming).toISO().split('.')[0];
        this.log(colors.green('Farming started...'));
    }

    async endFarming(proxy) {
        const data = JSON.stringify({ game_id: '53b22103-c7ff-413d-bc63-20f6fb806a07' });
        const url = 'https://api-web.tomarket.ai/tomarket-game/v1/farm/claim';
        const res = await this.http(url, this.headers, data, proxy);
        if (res.status !== 200) {
            this.log(colors.red('Unable to harvest tomatoes!'));
            return false;
        }
        const poin = res.data.data.claim_this_time;
        this.log(colors.green('Tomatoes harvested'));
        this.log(colors.green('Reward: ') + colors.white(poin));
    }

    async dailyClaim(proxy) {
        const url = 'https://api-web.tomarket.ai/tomarket-game/v1/daily/claim';
        const data = JSON.stringify({ game_id: 'fa873d13-d831-4d6f-8aee-9cff7a1d0db1' });
        const res = await this.http(url, this.headers, data, proxy);
        if (res.status !== 200) {
            this.log(colors.red('Unable to claim daily reward!'));
            return false;
        }

        const responseData = res.data.data;
        if (typeof responseData === 'string') {
            return false;
        }

        const poin = responseData.today_points;
        this.log(colors.green('Daily reward claimed, reward: ') + colors.white(poin));
        return true;
    }

    async playGameFunc(amountPass, proxy) {
        const dataGame = JSON.stringify({ game_id: '59bcd12e-04e2-404c-a172-311a0084587d' });
        const startUrl = 'https://api-web.tomarket.ai/tomarket-game/v1/game/play';
        const claimUrl = 'https://api-web.tomarket.ai/tomarket-game/v1/game/claim';
        for (let i = 0; i < amountPass; i++) {
            const res = await this.http(startUrl, this.headers, dataGame, proxy);
            if (res.status !== 200) {
                this.log(colors.red('Unable to start the game'));
                return;
            }
            this.log(colors.green('Game started...'));
            await this.countdown(30);
            const point = this.randomInt(this.gameLowPoint, this.gameHighPoint);
            const dataClaim = JSON.stringify({ game_id: '59bcd12e-04e2-404c-a172-311a0084587d', points: point });
            const resClaim = await this.http(claimUrl, this.headers, dataClaim, proxy);
            if (resClaim.status !== 200) {
                this.log(colors.red('Error claiming tomatoes from the game'));
                continue;
            }
            this.log(colors.green('Tomatoes received: ') + colors.white(point));
        }
    }

    async getBalance(proxy) {
        const url = 'https://api-web.tomarket.ai/tomarket-game/v1/user/balance';
        while (true) {
            const res = await this.http(url, this.headers, '{}', proxy);
            const data = res.data.data;
            if (!data) {
                this.log(colors.red('Failed to retrieve data'));
                return null;
            }

            const timestamp = data.timestamp;
            const balance = data.available_balance;
            this.log(colors.green('Balance: ') + colors.white(balance));

            if (!data.daily) {
                await this.dailyClaim(proxy);
                continue;
            }

            const lastCheckTs = data.daily.last_check_ts;
            if (DateTime.now().toSeconds() > lastCheckTs + 24 * 60 * 60) {
                await this.dailyClaim(proxy);
            }

            if (!data.farming) {
                this.log(colors.yellow('Farming has not started'));
                await this.startFarming(proxy);
                continue;
            }

            const endFarming = data.farming.end_at;
            const formatEndFarming = DateTime.fromMillis(endFarming * 1000).toISO().split('.')[0];
            if (timestamp > endFarming) {
                await this.endFarming(proxy);
                continue;
            }

            this.log(colors.yellow('Farming completion time: ') + colors.white(formatEndFarming));

            if (this.playGame) {
                const playPass = data.play_passes;
                this.log(colors.green('Game passes: ') + colors.white(playPass));
                if (parseInt(playPass) > 0) {
                    await this.playGameFunc(playPass, proxy);
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
                this.log(colors.cyan(`Has the token expired? ${isExpired ? 'Yes, you need to replace the token' : 'No, you are good to go'}`));
                
                return isExpired;
            } else {
                this.log(colors.yellow(`Eternal token with no expiration date`));
                return false;
            }
        } catch (error) {
            this.error(colors.red(`Error: ${error.message}`));
            return true;
        }
    }

    log(content) {
        console.log(`${colors.magenta(`[${DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss')}]`)} ${content}`);
    }

    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min) + min);
    }

    async countdown(seconds) {
        return new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }

    async http(url, headers, body, proxy) {
        const agent = new HttpsProxyAgent(proxy);
        return axios({
            method: 'post',
            url: url,
            headers: headers,
            data: body,
            httpsAgent: agent
        });
    }
}

const tomarket = new Tomarket();
const proxies = tomarket.loadProxies('proxy.txt');
const datas = tomarket.loadData('data.txt');
(async () => {
    for (let i = 0; i < datas.length; i++) {
        const proxy = proxies[i % proxies.length];
        const token = tomarket.get(i);
        if (token) {
            if (tomarket.isExpired(token)) {
                const newToken = await tomarket.login(datas[i], proxy);
                if (newToken) {
                    tomarket.setAuthorization(newToken);
                    tomarket.save(i, newToken);
                }
            } else {
                tomarket.setAuthorization(token);
            }
        } else {
            const newToken = await tomarket.login(datas[i], proxy);
            if (newToken) {
                tomarket.setAuthorization(newToken);
                tomarket.save(i, newToken);
            }
        }
        const next = await tomarket.getBalance(proxy);
        if (next) {
            await tomarket.countdown(next + 1);
        }
    }
})();
