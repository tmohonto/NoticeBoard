import { useState, useEffect, useMemo } from 'react';
import { Heart, MessageCircle, Share2, Download, Send, Trash2, Eye, EyeOff, X } from 'lucide-react';
import { db, auth } from '../firebase';
import { doc, updateDoc, arrayUnion, arrayRemove, collection, onSnapshot, addDoc, serverTimestamp, query, orderBy, deleteDoc } from 'firebase/firestore';
import { cn } from '../lib/utils';
import CommentItem from './CommentItem';

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
    const [selectedImage, setSelectedImage] = useState(null);

    const currentUser = auth.currentUser;
    const isLiked = likes.includes(currentUser?.uid);
    const isAdmin = currentUser?.email?.startsWith('admin');
    const isHidden = post.hidden || false;
    // Normalize images: either new 'imageUrls' array or old 'imageUrl' string
    const images = post.imageUrls || (post.imageUrl ? [post.imageUrl] : []);

    // Realtime comments
    useEffect(() => {
        const q = query(collection(db, 'posts', post.id, 'comments'), orderBy('createdAt', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setComments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsubscribe();
    }, [post.id]);

    // Build comment tree
    const { rootComments, replyMap } = useMemo(() => {
        const replyMap = new Map();
        const rootComments = [];

        comments.forEach(comment => {
            if (comment.parentId) {
                const existing = replyMap.get(comment.parentId) || [];
                existing.push(comment);
                replyMap.set(comment.parentId, existing);
            } else {
                rootComments.push(comment);
            }
        });

        return { rootComments, replyMap };
    }, [comments]);

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
            text: newComment.trim(),
            author: currentUser.email.split('@')[0], // 'i' or 'you'
            uid: currentUser.uid,
            createdAt: serverTimestamp(),
            parentId: null // Root comment
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

    const handleHide = async () => {
        try {
            await updateDoc(doc(db, 'posts', post.id), { hidden: true });
        } catch (err) {
            console.error("Error hiding post:", err);
            alert("Failed to hide post");
        }
    };

    const handleUnhide = async () => {
        try {
            await updateDoc(doc(db, 'posts', post.id), { hidden: false });
        } catch (err) {
            console.error("Error unhiding post:", err);
            alert("Failed to unhide post");
        }
    };

    const downloadImage = async (url) => {
        const targetUrl = url || images[0];
        if (!targetUrl) return;

        try {
            const response = await fetch(targetUrl);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `notice-board-${post.id}-${Date.now()}.jpg`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(blobUrl);
            document.body.removeChild(a);
        } catch (err) {
            console.error("Download failed", err);
            // Fallback: Open in new tab
            window.open(targetUrl, '_blank');
        }
    };

    const authorName = post.authorName || 'Unknown';
    const isMe = authorName === 'i';

    return (
        <div className={cn(
            "bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden mb-6 transition-all hover:shadow-md",
            isHidden && "opacity-75 border-dashed border-slate-300 ring-2 ring-slate-100 bg-slate-50"
        )}>
            {/* Header */}
            <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-bold text-white", isMe ? "bg-indigo-500" : "bg-pink-500")}>
                        {authorName[0].toUpperCase()}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-800">{authorName}</h3>
                            {isHidden && <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">Hidden</span>}
                        </div>
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

            {/* Images */}
            {images.length > 0 && (
                <div className={cn(
                    "relative group bg-slate-100",
                    images.length > 1 && "grid gap-1",
                    images.length === 2 && "grid-cols-2",
                    images.length > 2 && "grid-cols-2"
                )}>
                    {images.map((img, index) => (
                        <div
                            key={index}
                            onClick={() => setSelectedImage(img)}
                            className={cn(
                                "relative overflow-hidden flex items-center justify-center bg-slate-200 cursor-pointer hover:opacity-95 transition-opacity",
                                // Spanning logic for 3 images: First one spans 2 rows? Or just simple grid.
                                // Let's keep it simple: 3 images -> 4 slots (2x2), last one takes full width?
                                // Simple 2-col grid for now.
                                images.length === 3 && index === 0 && "col-span-2 aspect-video",
                                images.length !== 3 && "aspect-square"
                            )}
                        >
                            <img
                                src={img}
                                alt={`Post image ${index + 1}`}
                                className="w-full h-full object-cover"
                                loading="lazy"
                            />
                        </div>
                    ))}

                    {isHidden && (
                        <div className="absolute inset-0 bg-slate-900/10 backdrop-blur-[2px] flex items-center justify-center z-10">
                            <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-xl text-xs font-bold text-slate-500 shadow-sm border border-slate-200">
                                Hidden Post
                            </div>
                        </div>
                    )}
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
                        onClick={() => downloadImage()}
                        className="text-slate-400 hover:text-indigo-600 transition-colors p-2 hover:bg-indigo-50 rounded-full"
                        title="Save to folder"
                    >
                        <Download className="w-5 h-5" />
                    </button>

                    {isAdmin && (
                        <>
                            <button
                                onClick={isHidden ? handleUnhide : handleHide}
                                className={cn(
                                    "transition-colors p-2 rounded-full",
                                    isHidden
                                        ? "text-slate-400 hover:text-green-600 hover:bg-green-50"
                                        : "text-slate-400 hover:text-amber-500 hover:bg-amber-50"
                                )}
                                title={isHidden ? "Unhide Post" : "Hide Post"}
                            >
                                {isHidden ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                            </button>
                            <button
                                onClick={handleDelete}
                                className="text-slate-400 hover:text-red-600 transition-colors p-2 hover:bg-red-50 rounded-full"
                                title="Delete Post"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        </>
                    )}
                </div>

                {/* Comments Section */}
                {showComments && (
                    <div className="border-t border-slate-100 pt-4 animate-in slide-in-from-top-2">
                        {/* New Comment Input */}
                        <form onSubmit={handleComment} className="flex gap-2 mb-6">
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

                        {/* Comments List */}
                        <div className="space-y-1">
                            {rootComments.map(comment => (
                                <CommentItem
                                    key={comment.id}
                                    comment={comment}
                                    replyMap={replyMap}
                                    postId={post.id}
                                />
                            ))}
                            {comments.length === 0 && (
                                <p className="text-slate-400 text-sm text-center italic py-4">No comments yet. Start the conversation!</p>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Lightbox Modal */}
            {selectedImage && (
                <div
                    className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
                    onClick={() => setSelectedImage(null)}
                >
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            downloadImage(selectedImage);
                        }}
                        className="absolute top-4 right-16 text-white/50 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
                        title="Download Original"
                    >
                        <Download className="w-8 h-8" />
                    </button>
                    <button
                        onClick={() => setSelectedImage(null)}
                        className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
                    >
                        <X className="w-8 h-8" />
                    </button>
                    <img
                        src={selectedImage}
                        alt="Full screen"
                        className="max-w-full max-h-full object-contain shadow-2xl rounded-sm"
                        onClick={(e) => e.stopPropagation()} // Prevent close when clicking image
                    />
                </div>
            )}
        </div>
    );
}
