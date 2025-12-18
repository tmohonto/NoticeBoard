import { useState, useEffect, useRef } from 'react';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import Post from './Post';
import { LogOut, Image as ImageIcon, Loader2, Sparkles, Send, X } from 'lucide-react';

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
    const [files, setFiles] = useState([]);
    const [previews, setPreviews] = useState([]);
    const [text, setText] = useState('');
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    const authorName = user.email.split('@')[0];

    useEffect(() => {
        const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(post => {
                    const isAdmin = user.email.startsWith('admin');
                    // Show if: it's not hidden, OR if the current user is admin
                    return !post.hidden || isAdmin;
                }));
        });
        return () => unsubscribe();
    }, [user.email]);

    const handleFileSelect = async (e) => {
        if (!e.target.files || e.target.files.length === 0) return;

        const selectedFiles = Array.from(e.target.files);
        setFiles(prev => [...prev, ...selectedFiles]);

        // Generate previews
        const newPreviews = await Promise.all(selectedFiles.map(file => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(file);
            });
        }));
        setPreviews(prev => [...prev, ...newPreviews]);
    };

    const removeImage = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
        setPreviews(prev => prev.filter((_, i) => i !== index));
    };

    const handlePost = async () => {
        if (files.length === 0 && !text.trim()) return;
        setUploading(true);
        console.log("Starting upload process...");

        try {
            const postData = {
                authorName: authorName,
                authorId: user.uid,
                likes: [],
                createdAt: serverTimestamp()
            };

            // Add text if provided
            if (text.trim()) {
                postData.text = text.trim();
            }

            // Add images if provided
            if (files.length > 0) {
                console.log(`Compressing ${files.length} images...`);
                const base64Images = await Promise.all(files.map(file => compressImage(file)));
                console.log("Compression done.");
                postData.imageUrls = base64Images;
            }

            console.log("Saving to Firestore...");
            const savePost = addDoc(collection(db, 'posts'), postData);

            // Race against a 10s timeout
            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Request timed out. Check internet or Firebase rules.")), 10000)
            );

            await Promise.race([savePost, timeout]);
            console.log("Saved successfully!");

            setFiles([]);
            setPreviews([]);
            setText('');
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
                    {/* Text Input */}
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="What's on your mind?"
                        className="w-full p-3 bg-slate-50 border-0 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all text-sm resize-none mb-3"
                        rows="3"
                    />

                    {/* Image Previews */}
                    {previews.length > 0 && (
                        <div className="mb-4 grid grid-cols-2 gap-2">
                            {previews.map((preview, index) => (
                                <div key={index} className="relative group">
                                    <img
                                        src={preview}
                                        alt={`Preview ${index + 1}`}
                                        className="w-full h-32 object-cover rounded-lg border border-slate-100"
                                    />
                                    <button
                                        onClick={() => removeImage(index)}
                                        className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full hover:bg-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Image Upload Button */}
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-slate-50 transition-all group"
                    >
                        <div className="bg-indigo-50 p-3 rounded-full mb-2 group-hover:scale-110 transition-transform">
                            <ImageIcon className="w-5 h-5 text-indigo-500" />
                        </div>
                        <p className="text-xs font-medium text-slate-600">
                            {previews.length > 0 ? "Add more images" : "Add images"}
                        </p>
                    </div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        accept="image/*"
                        multiple
                        className="hidden"
                    />

                    {/* Post Button - Show if there's text OR images */}
                    {(text.trim() || files.length > 0) && (
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
