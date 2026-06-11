import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyB-mePkz_Tk323Vzw3PbRvuN3Nuspw6Hpo",
  authDomain: "dinheiro-livre.firebaseapp.com",
  projectId: "dinheiro-livre",
  storageBucket: "dinheiro-livre.firebasestorage.app",
  messagingSenderId: "846499652028",
  appId: "1:846499652028:web:3fb5b0466371d1981b0bb9",
};

const app = initializeApp(firebaseConfig);

// Firestore (banco padrao, provisionado na regiao southamerica-east1 / Sao Paulo).
// A regiao e definida na criacao do banco no console do Firebase, nao no codigo.
export const db = getFirestore(app);
export const auth = getAuth(app);

export default app;
