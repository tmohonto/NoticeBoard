import { useState, useEffect } from 'react';
import { Heart, MessageCircle, Share2, Download, Send, Trash2 } from 'lucide-react';
import { db, auth } from '../firebase';
import { doc, updateDoc, arrayUnion, arrayRemove, collection, onSnapshot, addDoc, serverTimestamp, query, orderBy, deleteDoc } from 'firebase/firestore';
import { cn } from '../lib/utils';

// Helper function to format timestamp
const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Just now';

    const now = new Date();
    const postDate = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diffInSeconds = Math.floor((now - postDate) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;

    return postDate.toLocaleDateString();
};

export default function Post({ post }) {
    const [likes, setLikes] = useState(post.likes || []);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [showComments, setShowComments] = useState(false);

    const currentUser = auth.currentUser;
    const isLiked = likes.includes(currentUser?.uid);
    const isAdmin = currentUser?.email?.startsWith('admin');

    // Realtime comments
    useEffect(() => {
        const q = query(collection(db, 'posts', post.id, 'comments'), orderBy('createdAt', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setComments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsubscribe();
    }, [post.id]);

    const toggleLike = async () => {
        if (!currentUser) return;
        const postRef = doc(db, 'posts', post.id);
        if (isLiked) {
            setLikes(prev => prev.filter(id => id !== currentUser.uid)); // Optimistic
            await updateDoc(postRef, { likes: arrayRemove(currentUser.uid) });
        } else {
            setLikes(prev => [...prev, currentUser.uid]); // Optimistic
            await updateDoc(postRef, { likes: arrayUnion(currentUser.uid) });
        }
    };

    const handleComment = async (e) => {
        e.preventDefault();
        if (!newComment.trim() || !currentUser) return;

        await addDoc(collection(db, 'posts', post.id, 'comments'), {
            text: newComment,
            author: currentUser.email.split('@')[0], // 'i' or 'you'
            uid: currentUser.uid,
            createdAt: serverTimestamp()
        });
        setNewComment('');
    };

    const handleDelete = async () => {
        if (window.confirm("Are you sure you want to delete this post? This cannot be undone.")) {
            try {
                await deleteDoc(doc(db, 'posts', post.id));
            } catch (err) {
                console.error("Error deleting post:", err);
                alert("Failed to delete post: " + err.message);
            }
        }
    };

    const downloadImage = async () => {
        try {
            const response = await fetch(post.imageUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `notice-board-${post.id}.jpg`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            console.error("Download failed", err);
            // Fallback: Open in new tab
            window.open(post.imageUrl, '_blank');
        }
    };

    const authorName = post.authorName || 'Unknown';
    const isMe = authorName === 'i';

    return (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden mb-6 transition-all hover:shadow-md">
            {/* Header */}
            <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-bold text-white", isMe ? "bg-indigo-500" : "bg-pink-500")}>
                        {authorName[0].toUpperCase()}
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800">{authorName}</h3>
                        <p className="text-xs text-slate-400">{formatTimestamp(post.createdAt)}</p>
                    </div>
                </div>
            </div>

            {/* Text Content */}
            {post.text && (
                <div className="px-4 pt-2 pb-3">
                    <p className="text-slate-800 whitespace-pre-wrap break-words">{post.text}</p>
                </div>
            )}

            {/* Image */}
            {post.imageUrl && (
                <div className="relative group bg-slate-100 min-h-[300px] flex items-center justify-center">
                    <img
                        src={post.imageUrl}
                        alt="Post"
                        className="w-full h-auto max-h-[600px] object-contain"
                        loading="lazy"
                    />
                </div>
            )}

            {/* Actions */}
            <div className="p-4">
                <div className="flex items-center gap-4 mb-4">
                    <button
                        onClick={toggleLike}
                        className={cn("flex items-center gap-2 transition-colors", isLiked ? "text-red-500" : "text-slate-400 hover:text-slate-600")}
                    >
                        <Heart className={cn("w-6 h-6", isLiked && "fill-current")} />
                        <span className="font-semibold">{likes.length}</span>
                    </button>

                    <button
                        onClick={() => setShowComments(!showComments)}
                        className="flex items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <MessageCircle className="w-6 h-6" />
                        <span className="font-semibold">{comments.length}</span>
                    </button>

                    <div className="flex-1" />

                    <button
                        onClick={downloadImage}
                        className="text-slate-400 hover:text-indigo-600 transition-colors p-2 hover:bg-indigo-50 rounded-full"
                        title="Save to folder"
                    >
                        <Download className="w-5 h-5" />
                    </button>

                    {isAdmin && (
                        <button
                            onClick={handleDelete}
                            className="text-slate-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-full"
                            title="Delete Post"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {/* Comments Section */}
                {showComments && (
                    <div className="border-t border-slate-100 pt-4 animate-in slide-in-from-top-2">
                        <div className="max-h-60 overflow-y-auto space-y-3 mb-4 custom-scrollbar">
                            {comments.map(comment => (
                                <div key={comment.id} className="flex gap-2 text-sm">
                                    <span className={cn("font-bold", comment.author === 'i' ? "text-indigo-600" : "text-pink-600")}>
                                        {comment.author}:
                                    </span>
                                    <span className="text-slate-700">{comment.text}</span>
                                </div>
                            ))}
                            {comments.length === 0 && (
                                <p className="text-slate-400 text-sm text-center italic">No comments yet.</p>
                            )}
                        </div>

                        <form onSubmit={handleComment} className="flex gap-2">
                            <input
                                type="text"
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                placeholder="Add a comment..."
                                className="flex-1 bg-slate-50 border-0 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                            />
                            <button
                                type="submit"
                                disabled={!newComment.trim()}
                                className="bg-indigo-600 text-white p-2 rounded-xl disabled:opacity-50 hover:bg-indigo-700 transition-colors"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
}
