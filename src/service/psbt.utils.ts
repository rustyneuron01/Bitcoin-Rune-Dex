import * as Bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import axios, { type AxiosResponse } from "axios";
import {
  COSIGNATURE_SIZE,
  MEMPOOL_URL,
  OPENAPI_UNISAT_TOKEN,
  OPENAPI_UNISAT_URL,
  SIGNATURE_SIZE,
  testVersion,
} from "../config/config";
import { type IRuneUtxo, type IUtxo, type IMempoolUTXO } from "../types/types";
import { WIFWallet } from "./WIFWallet";
import { LocalWallet } from "./localWallet";

Bitcoin.initEccLib(ecc);

const key = process.env.ADMIN_PRIVATE_KEY;
if (typeof key !== "string" || key === "") {
  throw new Error(
    "Environment variable PRIVATE_KEY must be set and be a valid string."
  );
}
const wallet = new WIFWallet({
  networkType: testVersion ? "testnet" : "mainnet",
  privateKey: key,
});

const localWallet = new LocalWallet(key as string, testVersion ? 1 : 0);

const blockstream = new axios.Axios({ baseURL: MEMPOOL_URL });

// Get Inscription UTXO
export const getInscriptionWithUtxo = async (inscriptionId: string) => {
  try {
    const url = `${OPENAPI_UNISAT_URL}/v1/indexer/inscription/info/${inscriptionId}`;

    const config = {
      headers: {
        Authorization: `Bearer ${OPENAPI_UNISAT_TOKEN}`,
      },
    };

    const res = await axios.get(url, config);

    if (res.data.code === -1) throw "Invalid inscription id";

    return {
      address: res.data.data.address,
      contentType: res.data.data.contentType,
      inscriptionId: inscriptionId,
      inscriptionNumber: res.data.data.inscriptionNumber,
      txid: res.data.data.utxo.txid,
      value: res.data.data.utxo.satoshi,
      vout: res.data.data.utxo.vout,
      scriptpubkey: res.data.data.utxo.scriptPk,
    };
  } catch (error) {
    console.log(
      `Ordinal api is not working now, please try again later Or invalid inscription id ${inscriptionId}`
    );
    throw "Invalid inscription id";
  }
};

// Get BTC UTXO
export const getBtcUtxoByAddress = async (address: string) => {
  const url = `${OPENAPI_UNISAT_URL}/v1/indexer/address/${address}/utxo-data`;

  const config = {
    headers: {
      Authorization: `Bearer ${OPENAPI_UNISAT_TOKEN}`,
    },
  };

  let cursor = 0;
  const size = 5000;
  const utxos: IUtxo[] = [];

  while (1) {
    const res = await axios.get(url, { ...config, params: { cursor, size } });

    if (res.data.code === -1) throw "Invalid Address";

    utxos.push(
      ...(res.data.data.utxo as any[]).map((utxo) => {
        return {
          scriptpubkey: utxo.scriptPk,
          txid: utxo.txid,
          value: utxo.satoshi,
          vout: utxo.vout,
        };
      })
    );

    cursor += res.data.data.utxo.length;

    if (cursor >= res.data.data.total - res.data.data.totalRunes) break;
  }

  return utxos;
};

// Get Rune UTXO
export const getRuneUtxoByAddress = async (address: string, runeId: string) => {
  const url = `${OPENAPI_UNISAT_URL}/v1/indexer/address/${address}/runes/${runeId}/utxo`;
  const config = {
    headers: {
      Authorization: `Bearer ${OPENAPI_UNISAT_TOKEN}`,
    },
  };
  let tokenSum = 0;
  let start = 0;
  let divisibility = 0;
  const limit = 500;
  const utxos: IRuneUtxo[] = [];
  while (1) {
    const res = await axios.get(url, { ...config, params: { start, limit } });
    if (res.data.data.utxo.length === 0) break;
    if (res.data.code === -1) throw "Invalid Address";
    utxos.push(
      ...(res.data.data.utxo as any[]).map((utxo) => {
        tokenSum += Number(utxo.runes[0].amount);
        divisibility = utxo.runes[0].divisibility;
        return {
          scriptpubkey: utxo.scriptPk,
          txid: utxo.txid,
          value: utxo.satoshi,
          vout: utxo.vout,
          amount: Number(utxo.runes[0].amount),
        };
      })
    );
    start += res.data.data.utxo.length;
    if (start === res.data.data.total) break;
  }
  return { runeUtxos: utxos, tokenSum, divisibility };
};

// Get BTC UTXO
export const waitUntilUTXO = async (address: string) => {
  return new Promise<IMempoolUTXO[]>((resolve, reject) => {
    let intervalId: any;
    const checkForUtxo = async () => {
      try {
        const response: AxiosResponse<string> = await blockstream.get(
          `/address/${address}/utxo`
        );
        const data: IMempoolUTXO[] = response.data
          ? JSON.parse(response.data)
          : undefined;
        if (data.length > 0) {
          resolve(data);
          clearInterval(intervalId);
        }
      } catch (error) {
        reject(error);
        clearInterval(intervalId);
      }
    };
    intervalId = setInterval(checkForUtxo, 5000);
  });
};

export const combinePsbt = async (
  hexedPsbt: string,
  signedHexedPsbt1: string,
  signedHexedPsbt2?: string
) => {
  try {
    const psbt = Bitcoin.Psbt.fromHex(hexedPsbt);
    const signedPsbt1 = Bitcoin.Psbt.fromHex(signedHexedPsbt1);
    if (signedHexedPsbt2) {
      const signedPsbt2 = Bitcoin.Psbt.fromHex(signedHexedPsbt2);
      psbt.combine(signedPsbt1, signedPsbt2);
    } else {
      psbt.combine(signedPsbt1);
    }
    const tx = psbt.extractTransaction();
    const txHex = tx.toHex();

    const txId = await pushRawTx(txHex);
    return txId;
  } catch (error) {
    console.log(error);
    throw error;
  }
};

export const pushRawTx = async (rawTx: string) => {
  const txid = await postData(`${MEMPOOL_URL}/tx`, rawTx);
  console.log("pushed txid", txid);
  return txid;
};

const postData = async (
  url: string,
  json: any,
  content_type = "text/plain",
  apikey = ""
) => {
  while (1) {
    try {
      const headers: any = {};

      if (content_type) headers["Content-Type"] = content_type;

      if (apikey) headers["X-Api-Key"] = apikey;
      const res = await axios.post(url, json, {
        headers,
      });

      return res.data;
    } catch (err: any) {
      const axiosErr = err;
      console.log("push tx error", axiosErr.response?.data);

      if (
        !(axiosErr.response?.data).includes(
          'sendrawtransaction RPC error: {"code":-26,"message":"too-long-mempool-chain,'
        )
      )
        throw new Error("Got an err when push tx");
    }
  }
};

export const finalizePsbtInput = async (hexedPsbt: string) => {
  const realPsbt = Bitcoin.Psbt.fromHex(hexedPsbt);
  realPsbt.signInput(0, wallet.ecPair);
  realPsbt.finalizeAllInputs();
  const tx = realPsbt.extractTransaction();

  return tx;
};


export const specialfinalizePsbtInput = (hexedPsbt: string, inputs: number[]) => {
  const psbt = Bitcoin.Psbt.fromHex(hexedPsbt);
  inputs.forEach((input) => psbt.finalizeInput(input));
  return psbt.toHex();
};

export const finalizeTapscriptPsbtInput = async (hexedPsbt: string) => {
  const realPsbt = Bitcoin.Psbt.fromHex(hexedPsbt);
  const signPsbt = await localWallet.signPsbt(realPsbt);
  const tx = signPsbt.extractTransaction(true);

  return tx;
};

export const getAllRuneIdList = async (address: string) => {
  const url = `${OPENAPI_UNISAT_URL}/v1/indexer/address/${address}/runes/balance-list?start=0&limit=500`;

  const config = {
    headers: {
      Authorization: `Bearer ${OPENAPI_UNISAT_TOKEN}`,
    },
  };

  const runeIdList: string[] = [];
  const res = await axios.get(url, config);

  if (res.data.code === -1) throw "Invalid Address";

  runeIdList.push(
    ...(res.data.data.detail as any[]).map((runeList) => runeList.runeid)
  );
  return runeIdList;
};

// Get Current Network Fee
export const getFeeRate = async () => {
  try {
    const url = `https://mempool.space/${
      testVersion ? "testnet/" : ""
    }api/v1/fees/recommended`;

    const res = await axios.get(url);

    return res.data.fastestFee;
  } catch (error) {
    console.log("Ordinal api is not working now. Try again later");
    return 40 * 2;
  }
};

// Calc Tx Fee
export const transferAllAssetsFeeCalc = (
  psbt: Bitcoin.Psbt,
  feeRate: number,
  thresHoldValue: number
) => {
  const tx = new Bitcoin.Transaction();

  console.log("psbt.txInputs ==> ", psbt.txInputs);
  for (let i = 0; i < psbt.txInputs.length; i++) {
    const txInput = psbt.txInputs[i];
    tx.addInput(txInput.hash, txInput.index, txInput.sequence);
    tx.setWitness(i, [Buffer.alloc(SIGNATURE_SIZE)]);
  }

  console.log("psbt.txOutputs ==> ", psbt.txOutputs);
  for (let txOutput of psbt.txOutputs) {
    tx.addOutput(txOutput.script, txOutput.value);
  }

  tx.addOutput(psbt.txOutputs[0].script, psbt.txOutputs[0].value);
  console.log(
    "tx virtial size ==> ",
    tx.virtualSize() + COSIGNATURE_SIZE * thresHoldValue
  );

  return Math.floor(
    (tx.virtualSize() + COSIGNATURE_SIZE * thresHoldValue) * feeRate
  );
};
