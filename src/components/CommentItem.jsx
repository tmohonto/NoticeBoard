import { useState } from 'react';
import { serverTimestamp, addDoc, collection } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { MessageCircle, CornerDownRight, Send } from 'lucide-react';
import { cn } from '../lib/utils';
import { formatDistanceToNow } from 'date-fns';

// Simple time formatter fallback if date-fns is not available or desire consistency
const formatTime = (timestamp) => {
    if (!timestamp) return 'Just now';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = (now - date) / 1000; // seconds
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString();
};

export default function CommentItem({ comment, replyMap, postId, depth = 0 }) {
    const [isReplying, setIsReplying] = useState(false);
    const [replyText, setReplyText] = useState('');

    // Safety clamp for indentation to prevent UI breaking
    // We visually clamp at depth 5, but logic continues infinitely
    const visualDepth = Math.min(depth, 5);

    const handleReply = async (e) => {
        e.preventDefault();
        if (!replyText.trim() || !auth.currentUser) return;

        try {
            await addDoc(collection(db, 'posts', postId, 'comments'), {
                text: replyText.trim(),
                author: auth.currentUser.email.split('@')[0],
                uid: auth.currentUser.uid,
                createdAt: serverTimestamp(),
                parentId: comment.id // Link to this comment
            });
            setReplyText('');
            setIsReplying(false);
        } catch (err) {
            console.error("Failed to reply:", err);
            alert("Failed to send reply");
        }
    };

    const replies = replyMap.get(comment.id) || [];

    return (
        <div className="flex flex-col">
            <div
                className={cn(
                    "flex gap-3 p-3 rounded-xl transition-colors hover:bg-slate-50",
                    isReplying && "bg-slate-50"
                )}
                style={{ marginLeft: `${visualDepth * 1.5}rem` }}
            >
                {/* Avatar */}
                <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs shrink-0",
                    comment.author === 'i' ? "bg-indigo-500" : "bg-pink-500"
                )}>
                    {comment.author[0]?.toUpperCase()}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-sm text-slate-800">{comment.author}</span>
                        <span className="text-xs text-slate-400">{formatTime(comment.createdAt)}</span>
                    </div>

                    <p className="text-sm text-slate-700 break-words mb-2">{comment.text}</p>

                    {/* Actions */}
                    <button
                        onClick={() => setIsReplying(!isReplying)}
                        className="text-xs font-semibold text-slate-500 hover:text-indigo-600 flex items-center gap-1 transition-colors"
                    >
                        <MessageCircle className="w-3 h-3" />
                        Reply
                    </button>

                    {/* Reply Form */}
                    {isReplying && (
                        <form onSubmit={handleReply} className="mt-3 flex gap-2 animate-in slide-in-from-top-2">
                            <div className="relative flex-1">
                                <input
                                    type="text"
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    placeholder={`Reply to ${comment.author}...`}
                                    className="w-full pl-8 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                                    autoFocus
                                />
                                <CornerDownRight className="w-4 h-4 text-slate-400 absolute left-2 top-2.5" />
                            </div>
                            <button
                                type="submit"
                                disabled={!replyText.trim()}
                                className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </form>
                    )}
                </div>
            </div>

            {/* Recursively render replies */}
            <div className="flex flex-col">
                {replies.map(reply => (
                    <CommentItem
                        key={reply.id}
                        comment={reply}
                        replyMap={replyMap}
                        postId={postId}
                        depth={depth + 1}
                    />
                ))}
            </div>
        </div>
    );
}
