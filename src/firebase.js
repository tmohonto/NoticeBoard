import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyDOMbF8hYz7bz07Fo1o37IOf6ql1n8Le4g",
    authDomain: "notice-board-eabf9.firebaseapp.com",
    projectId: "notice-board-eabf9",
    storageBucket: "notice-board-eabf9.firebasestorage.app",
    messagingSenderId: "980148126580",
    appId: "1:980148126580:web:5ae9e9e7551a15b95ce221",
    measurementId: "G-3F40LDGLTE"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
