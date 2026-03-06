import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyCPf9WYf0S8XQZQgPsuTxb9LNeShoRM02Q",
    authDomain: "cheque-ledger.firebaseapp.com",
    projectId: "cheque-ledger",
    storageBucket: "cheque-ledger.firebasestorage.app",
    messagingSenderId: "144481644231",
    appId: "1:144481644231:web:924d9b07ffbe09706658e2"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
