const {sha3_256} = require("js-sha3");
const {
    AccountAddress,
    Aptos,
    AptosConfig,
    DeriveScheme, Hex,
    Network,
    TypeTagAddress,
    TypeTagU64
} = require("@aptos-labs/ts-sdk");

const EMOJICOIN_REGISTRY_ADDRESS = "0x4b947ed016c64bde81972d69ea7d356de670d57fd2608b129f4d94ac0d0ee61";

function getEmojicoinMarketAddressAndTypeTags(args) {
    const marketAddress = deriveEmojicoinPublisherAddress({
        symbol: args.symbolBytes,
    });

    return {
        marketAddress,
        coin: `${marketAddress.toString()}::coin_factory::Emojicoin`,
        lp: `${marketAddress.toString()}::coin_factory::EmojicoinLP`,
    };
}

function deriveEmojicoinPublisherAddress(args) {
    return createNamedObjectAddress({
        creator: EMOJICOIN_REGISTRY_ADDRESS,
        seed: args.symbol,
    });
}

function createNamedObjectAddress(args) {
    const creatorAddress = AccountAddress.from(args.creator);
    const seed = Hex.fromHexInput(args.seed).toUint8Array();
    const serializedCreatorAddress = creatorAddress.bcsToBytes();
    const preImage = new Uint8Array([
        ...serializedCreatorAddress,
        ...seed,
        DeriveScheme.DeriveObjectAddressFromSeed,
    ]);
    return AccountAddress.from(sha3_256(preImage));
}

const aptos = new Aptos(new AptosConfig({network: Network.MAINNET}));

async function getAllMarkets() {
    const [registry] = await aptos.view({
        payload: {
            function: "0xface729284ae5729100b3a9ad7f7cc025ea09739cd6e7252aff0beb53619cafe::emojicoin_dot_fun::registry_view",
            abi: {
                parameters: [],
                typeParameters: [],
                returnTypes: []
            }
        }
    })

    return registry.n_markets
}

async function getNumberMarket(i) {
    const [market] = await aptos.view({
        payload: {
            function: "0xface729284ae5729100b3a9ad7f7cc025ea09739cd6e7252aff0beb53619cafe::emojicoin_dot_fun::market_metadata_by_market_id",
            functionArguments: [i],
            abi: {
                parameters: [new TypeTagU64()],
                typeParameters: [],
                returnTypes: []
            }
        }
    });

    const info = getEmojicoinMarketAddressAndTypeTags({symbolBytes: Hex.fromHexInput(market.vec[0].emoji_bytes).toUint8Array()})

    const [marketData] = await aptos.view({
        payload: {
            function: "0xface729284ae5729100b3a9ad7f7cc025ea09739cd6e7252aff0beb53619cafe::emojicoin_dot_fun::market_view",
            functionArguments: [info.marketAddress],
            typeArguments: [info.coin, info.lp],
            abi: {
                parameters: [new TypeTagAddress()],
                typeParameters: [{constraints: []}, {constraints: []}],
                returnTypes: [] // this really doesn't matter
            }
        }
    });

    return [[info.coin, marketData.emojicoin_balance], ["0x1::aptos_coin::AptosCoin", marketData.aptos_coin_balance]]
}

async function tvl(api) {
    const numMarkets = await getAllMarkets();

    const marketPromises = [];
    for (let i = 1; i <= numMarkets; i++) {
        console.log(`Adding ${i}`)
        marketPromises.push(getNumberMarket(i));
    }

    // Get all markets concurrently
    const markets = await Promise.all(marketPromises);
    markets.forEach(([[emojicoin, emojicoin_balance], [aptos_coin, aptos_coin_balance]]) => {
        api.add(emojicoin, emojicoin_balance);
        api.add(aptos_coin, aptos_coin_balance);
    })
}

module.exports = {
    timetravel: false,
    methodology:
        "Aggregates TVL in all pools in Emojicoin.fun",
    aptos: {
        tvl,
    },
};