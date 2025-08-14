import React, { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ethers } from "ethers";

import {
  Wallet, Link2, Shuffle, Upload, FileUp, Copy,
  ListChecks, CheckCircle2, AlertTriangle, Hash, HashIcon, Loader2, ExternalLink
} from "lucide-react";
import { Trophy } from "lucide-react";
// ícone de troféu

/**
 * App.jsx — UI/UX refinada (web3 clean + glass)
 * -> usa classes de raffle.css: app, shell, grid-12, card, input, textarea, btn, btn-primary, btn-neutral, code, badge, winner
 */

const CONTRACT_ADDRESS_DEFAULT = "0x660eBb941839c63D76115D5246FdcAA20C786fE6";
const MONAD_CHAIN_ID_HEX = "0x279f"; // 10143
const MONAD_PARAMS = {
  chainId: MONAD_CHAIN_ID_HEX,
  chainName: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: ["https://testnet-rpc.monad.xyz"],
  blockExplorerUrls: ["https://testnet.monadexplorer.com"],
};

const RAFFLE_ABI = [
  "function nextId() view returns (uint256)",
  "function createRaffle(string name, uint32 numWinners, bytes32 participantsHash, string participantsURI, bytes32 secretCommitment) returns (uint256 id)",
  "function draw(uint256 id, string secret, address[] participants)",
  "function getWinners(uint256 id) view returns (address[])",
  "event RaffleCreated(uint256 indexed id, address indexed organizer, string name, uint32 numWinners, bytes32 participantsHash, string participantsURI, bytes32 secretCommitment, uint64 targetChainId, uint64 createdAt)",
  "event WinnersDrawn(uint256 indexed id, bytes32 randomness, address[] winners)"
];

function normalizeAddressesFromText(text) {
  const lines = text.split(/\r?\n|,|;|\s+/).map(x=>x.trim()).filter(Boolean);
  const uniq = Array.from(new Set(lines));
  return uniq.map(ethers.getAddress);
}

function randomSecret() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b).map(x=>x.toString(16).padStart(2,"0")).join("");
}

export default function App() {
  const [contractAddr, setContractAddr] = useState(CONTRACT_ADDRESS_DEFAULT);
  const [chainIdHex, setChainIdHex] = useState(MONAD_CHAIN_ID_HEX);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [contract, setContract] = useState(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("Sorteio");
  const [numWinners, setNumWinners] = useState(1);
  const [participantsText, setParticipantsText] = useState("");
  const [participantsURI, setParticipantsURI] = useState("");
  const [secret, setSecret] = useState(() => randomSecret());
  const [raffleId, setRaffleId] = useState("");
  const [status, setStatus] = useState("");
  const [txHash, setTxHash] = useState("");
  const [winners, setWinners] = useState([]);
  const fileRef = useRef(null);
  const [lookupId, setLookupId] = useState("");
  const [lookupWinners, setLookupWinners] = useState([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupMsg, setLookupMsg] = useState("");


  const addresses = useMemo(()=>{
    try { return participantsText ? normalizeAddressesFromText(participantsText) : []; }
    catch { return null; }
  }, [participantsText]);

  const participantsHash = useMemo(()=>{
    try {
      if (!addresses || addresses.length===0) return null;
      return ethers.solidityPackedKeccak256(["address[]"], [addresses]);
    } catch { return null; }
  }, [addresses]);

  const secretCommitment = useMemo(()=> secret ? ethers.keccak256(ethers.toUtf8Bytes(secret)) : null, [secret]);

  async function addOrSwitchMonad() {
    if (!window.ethereum) { setStatus("Wallet não encontrada"); return; }
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: MONAD_CHAIN_ID_HEX }] });
    } catch (e) {
      if (e?.code === 4902 || /Unrecognized chain ID/i.test(e?.message||"")) {
        await window.ethereum.request({ method: "wallet_addEthereumChain", params: [ MONAD_PARAMS ] });
      } else { throw e; }
    }
  }

  async function connect() {
    try {
      setBusy(true); setStatus("Conectando carteira…");
      await addOrSwitchMonad();
      const prov = new ethers.BrowserProvider(window.ethereum);
      const sign = await prov.getSigner();
      const acc = await sign.getAddress();
      setProvider(prov); setSigner(sign); setAccount(acc);
      setContract(new ethers.Contract(contractAddr, RAFFLE_ABI, sign));
      setStatus("Carteira conectada");
    } catch (e) { setStatus("Falha ao conectar: "+(e?.shortMessage||e?.message||e)); }
    finally { setBusy(false); }
  }

  function onFile(e){
    const f = e.target.files?.[0]; if(!f) return;
    const r = new FileReader(); r.onload = () => setParticipantsText(String(r.result||"")); r.readAsText(f);
  }

  async function onCreate(){
    try {
      if (!signer) throw new Error("Conecte a carteira");
      if (!contractAddr) throw new Error("Informe o endereço do contrato");
      if (!addresses || addresses.length===0) throw new Error("Informe a lista de carteiras (textarea ou CSV)");
      if (!participantsHash) throw new Error("Falha ao calcular participantsHash");
      setBusy(true); setStatus("Enviando tx de criação…");
      const c = contract ?? new ethers.Contract(contractAddr, RAFFLE_ABI, signer);
      const tx = await c.createRaffle(name.trim(), Number(numWinners), participantsHash, participantsURI.trim(), secretCommitment);
      const rc = await tx.wait(); setTxHash(rc.hash);

      // tentar extrair o ID do evento; se não vier, tenta nextId()-1
      let id = "";
      for (const log of rc.logs) {
        try {
          const p = c.interface.parseLog(log);
          if (p?.name === "RaffleCreated") { id = p.args?.id?.toString(); break; }
        } catch {}
      }
      if (!id) {
        try { const nx = await c.nextId(); id = (BigInt(nx) - 1n).toString(); } catch {}
      }
      setRaffleId(id);
      setStatus(`Sorteio criado${id?` (ID ${id})`:''}`);
    } catch(e){ setStatus("Erro ao criar: "+(e?.shortMessage||e?.message||e)); }
    finally { setBusy(false); }
  }
async function onLookup() {
  try {
    if (!contract) throw new Error("Conecte a carteira/contrato primeiro.");
    const idNum = Number(lookupId);
    if (!Number.isFinite(idNum)) throw new Error("ID inválido.");
    setLookupBusy(true);
    setLookupMsg("Buscando vencedores…");
    const w = await contract.getWinners(idNum);
    setLookupWinners(w);
    setLookupMsg(w.length ? `Encontrados ${w.length} vencedor(es).` : "Nenhum vencedor registrado ainda para este ID.");
  } catch (e) {
    setLookupWinners([]);
    setLookupMsg(e?.shortMessage || e?.message || String(e));
  } finally {
    setLookupBusy(false);
  }
}

  async function onDraw(){
    try {
      if (!signer) throw new Error("Conecte a carteira");
      const idNum = Number(raffleId); if(!Number.isFinite(idNum)) throw new Error("Informe o Raffle ID");
      if (!addresses || addresses.length===0) throw new Error("Informe a lista de carteiras");
      if (!secret) throw new Error("Informe o secret (reveal)");
      setBusy(true); setStatus("Sorteando on-chain…");
      const c = contract ?? new ethers.Contract(contractAddr, RAFFLE_ABI, signer);
      const tx = await c.draw(idNum, secret, addresses);
      const rc = await tx.wait(); setTxHash(rc.hash);
      const w = await c.getWinners(idNum); setWinners(w);
      setStatus(`Sorteio concluído com ${w.length} vencedores.`);
    } catch(e){ setStatus("Erro ao sortear: "+(e?.shortMessage||e?.message||e)); }
    finally { setBusy(false); }
  }

  function copy(v){ navigator.clipboard?.writeText(v||""); setStatus("Copiado!"); }

  const explorerTx = txHash ? `https://monad-testnet.socialscan.io/tx/${txHash}` : "";

  return (
  <div className="app">
    <div className="shell">
      {/* HERO */}
      <motion.div className="hero" initial={{opacity:0, y:-8}} animate={{opacity:1, y:0}}>
        <h1 className="headline">On-chain giveaways</h1>
        <p>Crie e execute sorteios on-chain, multi-vencedores, com transparência total.</p>
      </motion.div>

      {/* TOPO: 3 CARDS */}
      <div className="grid-12">
        {/* Config */}
        <div className="card" style={{gridColumn:"span 12 / span 12"}}>
          <h3 className="card-title">Configuração</h3>
          <div className="grid-12">
            <div style={{ gridColumn: "span 12 / span 12" }}>
              <label>Endereço do contrato</label>
              <input
                className="input"
                value={contractAddr}
                readOnly
                placeholder="0x…"
              />
            </div>

            <div style={{gridColumn:"span 12 / span 12", marginTop:12, display:"flex", gap:8}}>
              <button onClick={addOrSwitchMonad} className="btn btn-neutral">
                <Link2 className="icon-4" /> Add/Switch Monad
              </button>
              <button onClick={connect} disabled={busy} className="btn btn-primary">
                {busy ? <Loader2 className="icon-4" style={{animation:"spin .8s linear infinite"}}/> : <Wallet className="icon-4" />}
                Conectar
              </button>
            </div>

            {account && (
              <div style={{gridColumn:"span 12 / span 12", marginTop:12}} className="card-sub">
                <CheckCircle2 className="icon-4" style={{color:"#10b981", marginRight:6}}/>
                {account}
              </div>
            )}
          </div>
        </div>

        {/* Hashes */}
        <div className="card" style={{gridColumn:"span 12 / span 12"}}>
          <h3 className="card-title">Integridade</h3>
          <label>participantsHash</label>
          <div className="code mono">{participantsHash || "—"}</div>
          <label style={{marginTop:8}}>secretCommitment</label>
          <div className="code mono">{secretCommitment || "—"}</div>
          {txHash && (
            <div className="card-sub mono" style={{marginTop:8}}>
              tx: {txHash}{" "}
              {explorerTx && (
                <a className="link" href={explorerTx} target="_blank" rel="noreferrer">
                  (ver no explorer <ExternalLink className="icon-4" />)
                </a>
              )}
            </div>
          )}
        </div>

        
      </div>

      {/* CRIAR SORTEIO */}
      <div className="card" style={{marginTop:16}}>
        <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:8}}>
          <Upload className="icon-4" style={{color:"#6366F1"}}/>
          <h2 className="card-title" style={{margin:0}}>Criar sorteio</h2>
        </div>

        <div className="grid-12">
          <div style={{gridColumn:"span 12 / span 12"}}>
            <label>Nome do evento</label>
            <input className="input" value={name} onChange={e=>setName(e.target.value)} />
          </div>

          <div style={{gridColumn:"span 12 / span 12", marginTop:12}}>
            <label>Nº de vencedores</label>
            <input className="input" type="number" min={1} value={numWinners} onChange={e=>setNumWinners(Number(e.target.value))} />
          </div>

          <div style={{gridColumn:"span 12 / span 12", marginTop:12}}>
            <label>Participantes (uma carteira por linha) ou CSV/TXT</label>
            <textarea className="textarea" value={participantsText} onChange={e=>setParticipantsText(e.target.value)} placeholder={"0xabc...\n0xdef..."} />
            <div style={{display:"flex", gap:8, marginTop:8, alignItems:"center"}}>
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={onFile} className="hidden" />
              <button onClick={()=>fileRef.current?.click()} className="btn btn-neutral"><FileUp className="icon-4" /> Carregar arquivo</button>
              <span className="card-sub">Endereços únicos: {Array.isArray(addresses)?addresses.length:0}</span>
            </div>
          </div>
/*
          <div style={{gridColumn:"span 12 / span 12", marginTop:12}}>
            <label>Secret (reveal)</label>
            <div style={{display:"flex", gap:8}}>
              <input className="input mono" value={secret} onChange={e=>setSecret(e.target.value)} />
              <button onClick={()=>setSecret(randomSecret())} className="btn btn-neutral">Gerar</button>
              <button onClick={()=>copy(secret)} className="btn btn-neutral"><Copy className="icon-4" /></button>
            </div>
            <div className="card-sub" style={{marginTop:6, color:"#92400E"}}>
              <AlertTriangle className="icon-4" style={{marginRight:6}}/> Guarde o secret — você precisará dele para sortear.
            </div>
          </div>
        </div>*/

        <div style={{display:"flex", flexWrap:"wrap", gap:12, marginTop:14, alignItems:"center"}}>
          <button onClick={onCreate} disabled={busy} className="btn btn-primary">
            {busy ? <Loader2 className="icon-4" style={{animation:"spin .8s linear infinite"}}/> : <Upload className="icon-4" />}
            Criar sorteio
          </button>
        </div>
      </div>

      {/* SORTEAR */}
      <div className="card" style={{marginTop:16}}>
        <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:8}}>
          <Shuffle className="icon-4" style={{color:"#6366F1"}}/>
          <h2 className="card-title" style={{margin:0}}>Sortear vencedores</h2>
        </div>

        <div className="grid-12">
          <div style={{gridColumn:"span 12 / span 12"}}>
            <label>Raffle ID</label>
            <input className="input" value={raffleId} onChange={e=>setRaffleId(e.target.value)} />
          </div>
        </div>

        <div style={{marginTop:12}}>
          <button onClick={onDraw} disabled={busy} className="btn btn-neutral">
            {busy ? <Loader2 className="icon-4" style={{animation:"spin .8s linear infinite"}}/> : <Shuffle className="icon-4" />}
            Sortear on-chain
          </button>
        </div>

        {winners?.length > 0 && (
          <div style={{marginTop:16}}>
            <div className="card-sub" style={{fontWeight:700}}>Vencedores</div>
            <div style={{marginTop:8, display:'grid', gap:8}}>
              {winners.map((w,i)=>(
                <div key={w+String(i)} className="winner" style={{width:'fit-content'}}>
                  <Trophy className="icon-4" style={{color:"#FACC15"}}/>
                  <span className="mono">{w}</span>
                  <button onClick={()=>copy(w)} className="btn">copiar</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* CONSULTAR SORTEIO POR ID */}
      <div className="card" style={{marginTop:16}}>
        <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:8}}>
          <h2 className="card-title" style={{margin:0}}>Consultar sorteio</h2>
        </div>

        <div className="grid-12">
          <div style={{gridColumn:"span 12 / span 12"}}>
            <label>Raffle ID</label>
            <input
              className="input"
              value={lookupId}
              onChange={(e)=>setLookupId(e.target.value)}
              onKeyDown={(e)=> e.key==='Enter' && onLookup()}
              placeholder="ex.: 0, 1, 2…"
            />
          </div>
        </div>

        <div style={{marginTop:12, display:'flex', gap:8, alignItems:'center'}}>
          <button onClick={onLookup} disabled={lookupBusy} className="btn btn-primary">
            {lookupBusy ? "Buscando..." : "Buscar vencedores"}
          </button>
          {lookupMsg && <div className="status">{lookupMsg}</div>}
        </div>

        {lookupWinners.length > 0 && (
          <div style={{marginTop:16}}>
            <div className="card-sub" style={{fontWeight:700}}>Vencedores</div>
            <div style={{marginTop:8, display:'grid', gap:8}}>
              {lookupWinners.map((w,i)=>(
                <div key={w+String(i)} className="winner" style={{width:'fit-content'}}>
                  <Trophy className="icon-4" style={{color:"#FACC15"}}/>
                  <span className="mono">{w}</span>
                  <button className="btn" onClick={()=>navigator.clipboard?.writeText(w)}>copiar</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div style={{marginTop:18, textAlign:"center"}}>
        <span className="card-sub">
          <ListChecks className="icon-4" style={{marginRight:6}}/>
          Use apenas na Monad Testnet (10143). Para produção, prefira VRF.
        </span>
      </div>
    </div>
  </div>
);
}