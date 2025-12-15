import { useState, useEffect, useRef } from 'react';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import Post from './Post';
import { LogOut, Image as ImageIcon, Loader2, Sparkles, Send } from 'lucide-react';

// Helper to compress image to Base64 (max 800px)
const compressImage = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 800;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                // Compress to JPEG with 0.4 quality
                resolve(canvas.toDataURL('image/jpeg', 0.4));
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
};

export default function Feed({ user }) {
    const [posts, setPosts] = useState([]);
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    const authorName = user.email.split('@')[0];

    useEffect(() => {
        const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, []);

    const handleFileSelect = (e) => {
        const selected = e.target.files[0];
        if (!selected) return;
        setFile(selected);
        const reader = new FileReader();
        reader.onloadend = () => setPreview(reader.result);
        reader.readAsDataURL(selected);
    };

    const handlePost = async () => {
        if (!file) return;
        setUploading(true);
        console.log("Starting upload process...");

        try {
            // Compress and convert to Base64 string
            console.log("Compressing image...");
            const base64String = await compressImage(file);
            console.log("Compression done. Size:", base64String.length);

            console.log("Saving to Firestore...");
            // Create a promise wrapper for addDoc to handle network timeouts
            const savePost = addDoc(collection(db, 'posts'), {
                imageUrl: base64String, // Saving directly to DB
                authorName: authorName,
                authorId: user.uid,
                likes: [],
                createdAt: serverTimestamp()
            });

            // Race against a 10s timeout
            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Request timed out. Check internet or Firebase rules.")), 10000)
            );

            await Promise.race([savePost, timeout]);
            console.log("Saved successfully!");

            setFile(null);
            setPreview(null);
        } catch (err) {
            console.error("Post failed", err);
            alert("Error: " + err.message);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="max-w-md mx-auto min-h-screen flex flex-col">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-md sticky top-0 z-10 p-4 flex justify-between items-center border-b border-slate-100 shadow-sm">
                <div className="flex items-center gap-2">
                    <div className="bg-gradient-to-tr from-indigo-600 to-pink-500 w-8 h-8 rounded-lg flex items-center justify-center text-white">
                        <Sparkles className="w-5 h-5" />
                    </div>
                    <h1 className="font-bold text-lg text-slate-800">Notice Board</h1>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-600">
                        Hi, <span className={authorName === 'i' ? "text-indigo-600" : "text-pink-600"}>{authorName}</span>
                    </span>
                    <button
                        onClick={() => signOut(auth)}
                        className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-red-500 transition-colors"
                    >
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 p-4">
                {/* Create Post Widget */}
                <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 mb-8">
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-slate-50 transition-all group"
                    >
                        {preview ? (
                            <img src={preview} alt="Preview" className="max-h-64 rounded-lg object-contain" />
                        ) : (
                            <>
                                <div className="bg-indigo-50 p-4 rounded-full mb-3 group-hover:scale-110 transition-transform">
                                    <ImageIcon className="w-6 h-6 text-indigo-500" />
                                </div>
                                <p className="text-sm font-medium text-slate-600">Tap to select an image</p>
                            </>
                        )}
                    </div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        accept="image/*"
                        className="hidden"
                    />

                    {preview && (
                        <button
                            onClick={handlePost}
                            disabled={uploading}
                            className="w-full mt-4 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-200 hover:shadow-indigo-300 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {uploading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Posting...
                                </>
                            ) : (
                                <>
                                    <Send className="w-5 h-5" />
                                    Post to Board
                                </>
                            )}
                        </button>
                    )}
                </div>

                {/* Posts */}
                <div className="space-y-6">
                    {posts.map(post => (
                        <Post key={post.id} post={post} />
                    ))}
                    {posts.length === 0 && (
                        <div className="text-center py-10 text-slate-400">
                            <p>No posts yet. Be the first!</p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
