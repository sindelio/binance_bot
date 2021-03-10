const Binance = require('binance-api-node').default;
const { EMA } = require('technicalindicators');

// Creates the API caller/requester as an authenticated client, which can make signed calls
const client = Binance({
  apiKey: 'YOUR_API_KEY',
  apiSecret: 'YOUR_API_SECRET',
});

const COIN_PAIR = 'BANDUSDT';
const CANDLE_INTERVAL = '15m';
const WAITING_TIME_MS = 1000 * 60 * 15; // 15 minutes

// VARIABLES - Binance API
let buyOrderInfo = null;
let sellOrderInfo = null;

const INDEX_USDT = 14;
const PRICE_UPDATE_PERIOD = 5000; // Price update times varies a lot
const ORDER_UPDATE_PERIOD = 3000;

const BUY_LIMIT = 5; 

// FUNCTIONS

// Pauses execution for a specified amount of time
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Synchronizes with the Binance API server
const sync = async () => {
	console.log('WAITING FOR', CANDLE_INTERVAL, '...');

	const serverTime = await client.time();
	const timeDifference = serverTime % (WAITING_TIME_MS);
	await wait(timeDifference + 1000); // Waits 1s more to make sure the prices were updated

	console.log('WAITING IS FINISHED !');
}


// Updates the input for the EMA calculation. It adds the newest price and removes the oldest one.
const fetchPrices = async () => {
	console.log('FETCHING PRICES...');
	
	const candles = await client.candles({
		symbol: COIN_PAIR,
		interval: CANDLE_INTERVAL,
	});

	const prices = {
		opening : {
			values: [],
			times: [],
		},
		closing : {
			values: [],
			times: [],
		},
	}

	for(let i = 0; i < candles.length; ++i) {
		prices.opening.values[i] = Number(candles[i].open);
		prices.opening.times[i] = candles[i].openTime;

		prices.closing.values[i] = Number(candles[i].close);
		prices.closing.times[i] = candles[i].closeTime;
	}

	return prices;
}

const calculateEMADiff = async (openingPrices, closingPrices) => {
	console.log('CALCULATING EMA DIFFERENCE...');

	let ema1 = EMA.calculate({period: 13, values: closingPrices});
	let ema2 = EMA.calculate({period: 21, values: openingPrices});

	common_length = 2;
	ema1 = ema1.slice(-common_length);
	ema2 = ema2.slice(-common_length);

	const result = ema2.subtract(ema1);

	console.log("PREVIOUS EMA DIFFERENCE : ", result[0], "\nCURRENT EMA DIFFERENCE : ", result[1]);

	return ema2.subtract(ema1);
}

// Calculates how much of the asset(coin) the program can buy. The quantity is floored to an integer
const calculateBuyQuantity = async () => {
	console.log('CALCULATING BUY QUANTITY');
	let accountInfo = await client.accountInfo();
	let USDTBalance = accountInfo.balances[INDEX_USDT].free;

	// Maximum 15 USD is used for buying
	if(USDTBalance > 15){
		USDTBalance = 15;
	}

	console.log('USDT balance: ', USDTBalance);

	const prices = await client.prices({ symbol: COIN_PAIR });
	const currentPrice = prices.XRPUSDT;

	console.log(COIN_PAIR, ' Price: ', currentPrice);

	const buyQuantity = Math.floor(0.99 * (USDTBalance / currentPrice));

	console.log('BuyQuantity: ', buyQuantity, '\n');

	return { 
		buyQuantity,
		currentPrice
	};
}

// Creates a buy order in the Binance API
const makeBuyOrder = async (buyQuantity, currentPrice) => {
	console.log('MAKING BUY ORDER');
	buyOrderInfo = await client.order({
		symbol: COIN_PAIR,
		side: 'BUY',
		quantity: buyQuantity,
		price: currentPrice,
	});

	console.log('buyOrderInfo: ', buyOrderInfo, '\n');
}

// Waits till a buy order is completely filled or times out empty
const waitBuyOrderCompletion = async () => {
	console.log('WAITING BUY ORDER COMPLETION');

	for(let i = 0; i < 5;	i++){
		buyOrderInfo = await client.getOrder({
			symbol: COIN_PAIR,
  			orderId: buyOrderInfo.orderId,
		});

		if(buyOrderInfo.status === 'FILLED'){
			console.log('PURCHASE COMPLETED! \n');
			return 'success';
		}

		await wait(ORDER_UPDATE_PERIOD);
	}
	
	if(buyOrderInfo.status === 'PARTIALLY_FILLED'){

		console.log('PURCHASE PARTIALLY FILLED, CONTINUING');

		while(true){
			buyOrderInfo = await client.getOrder({
				symbol: COIN_PAIR,
				orderId: buyOrderInfo.orderId,
			});

			if(buyOrderInfo.status === 'FILLED'){

				console.log('PURCHASE COMPLETED! \n');
				return 'success';
			}

			await wait(ORDER_UPDATE_PERIOD);
		}
	}

	console.log('PURCHASE TIMED OUT, CANCELLING \n');

	await client.cancelOrder({
		symbol: COIN_PAIR,
  		orderId: buyOrderInfo.orderId,
	});

	return 'failure';
}

// Purchasing mechanism, invokes the 3 functions above as needed
const buy = async () => {
	console.log('BUYING');

	const { buyQuantity, currentPrice } = await calculateBuyQuantity();
	await makeBuyOrder(buyQuantity, currentPrice);

	const buySuccess = await waitBuyOrderCompletion();
	return buySuccess;
}

// Calculates how much profit a sale would incur
const calculateProfit = async () => {
	console.log('CALCULATING PROFIT');
	
	const buyingPrice = buyOrderInfo.price;
	const prices = await client.prices({ symbol: COIN_PAIR });

	const currentPrice = prices.XRPUSDT;
	const profit = ((currentPrice / buyingPrice) - 1) * 100;

	console.log('profit: ', profit, '\n');

	return {
		profit,
		currentPrice
	};
}

// Creates a sell order in the Binance API
const makeSellOrder = async (currentPrice) => {
	console.log('MAKING SELL ORDER');

	sellOrderInfo = await client.order({
		symbol: COIN_PAIR,
		side: 'SELL',
		quantity: buyOrderInfo.executedQty,
		price: currentPrice,
	});

	console.log('sellOrderInfo: ', sellOrderInfo, '\n');
}

// Waits till a sell order is completely filled or times out empty
const waitSellOrderCompletion = async () => {
	console.log('WAITING SELL ORDER COMPLETION');

	for(let i = 0; i < 5; i++){
		sellOrderInfo = await client.getOrder({
			symbol: COIN_PAIR,
			orderId: sellOrderInfo.orderId,
		});

		if(sellOrderInfo.status === 'FILLED'){
			console.log('SALE COMPLETE! \n');
			return 'success';
		}

		await wait(ORDER_UPDATE_PERIOD);
	}

	if(sellOrderInfo.status === 'PARTIALLY_FILLED'){

		console.log('SALE PARTIALLY FILLED, CONTINUING');

		while(true){
			sellOrderInfo = await client.getOrder({
				symbol: COIN_PAIR,
				orderId: sellOrderInfo.orderId,
			});

			if(sellOrderInfo.status === 'FILLED'){
				console.log('SALE COMPLETE! \n');
				return 'success';
			}

			await wait(ORDER_UPDATE_PERIOD);
		}
	}

	console.log('SALE TIMED OUT, CANCELLING \n');

	await client.cancelOrder({
		symbol: COIN_PAIR,
  		orderId: sellOrderInfo.orderId,
	});

	return 'failure';
}

// Selling mechanism, invokes the 3 functions above as needed
const sell = async () => {
	console.log('SELLING');

	while(true){
		const { profit, currentPrice } = await calculateProfit();

		if(profit >= 0.175){
			await makeSellOrder(currentPrice);
			const sellSuccess = await waitSellOrderCompletion();
			if(sellSuccess === 'failure') continue;
			return;
		}

		await wait(PRICE_UPDATE_PERIOD);
	}
}

// Main function, entrance point for the program
(async function main() {
	let prices = null; let emaDifferences = null; 
	while(true){
		try {
			prices = await fetchPrices();
		} catch (e) {
			console.error('ERROR IN updateInputEMA(): ', e);
			process.exit(-1);
		}

		try {
			emaDifferences = await calculateEMADiff(prices.opening.values, prices.closing.values);
		} catch (e) {
			console.error('ERROR IN calculateEMA(): ', e);
			process.exit(-1);
		}

		const prev = emaDifferences[emaDifferences.length - 2];
		const curr = emaDifferences.last();

		// previously ema2 > ema1 and currently ema2 < ema1
		if(prev > 0 && curr < 0) {
			const time = new Date(prices.opening.times.last());
			console.log("ALIM FIRSATI : ", time.toLocaleTimeString());
			// %1 altına stop-loss koy
			// %1 üstüne satış koy yarısı için
			// %1 üstüne diğer yarısı için "trailing-stop-loss" işlemi başlat
		}
		
		
		

		// if(smoothedEMA < BUY_LIMIT){ // Buy condition
		// 	try {
		// 		buySuccess = await buy();	
		// 	} catch (e) {
		// 		console.error('ERROR IN buy(): ', e);
		// 		console.log('RESUMING OPERATIONS\n');
		// 		continue;
		// 	}
		// 	if(buySuccess === 'failure') continue;
		// 	try {
		// 		await sell();		
		// 	} catch (e) {
		// 		console.error('ERROR IN sell(): ', e);
		// 		process.exit(-1);
		// 	}			
		// }

		await sync();
	}
})();


if (!Array.prototype.last){
    Array.prototype.last = function(){
        return this[this.length - 1];
    };
};

if (!Array.prototype.subtract){
    Array.prototype.subtract = function(other_array){
        const result = [];

		for(let i = 0; i < this.length; ++i){
			result[i] = this[i] - other_array[i];
		};

		return result;
		
    };
};