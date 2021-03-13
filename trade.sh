# Trading currency
currency=USDT

# Coins to be traded
# Place or remove coin between parantheses
coin_list=(\
BAND \
BNB \
BTC \
HOT \
LTC \
LUNA \
MATIC \
YFII \
)

# The .txt files' directory for test results
output_directory=./${1}
mkdir -p ${output_directory}

for coin in ${coin_list[@]};
do
    pair=${coin}${currency}
	ttab node binance_bot.js ${pair} > ${output_directory}/${pair}.txt
done