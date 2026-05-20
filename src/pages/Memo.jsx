import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { Send, User, MessageSquare, Check } from 'lucide-react';
import auditLogger from '../utils/auditLogger';

const Memo = () => {
    const { user, users } = useAuth();
    const { notifications, addNotification, markNotificationAsRead, toggleReaction } = useData();
    const [selectedRecipients, setSelectedRecipients] = useState([]);
    const [messageContent, setMessageContent] = useState('');
    const [replyTo, setReplyTo] = useState(null);
    const [showReaders, setShowReaders] = useState(null);
    const [showReactionPicker, setShowReactionPicker] = useState(null);
    const [lastReadTimestamp, setLastReadTimestamp] = useState(Date.now());
    const [hasNewMessagesAbove, setHasNewMessagesAbove] = useState(false);

    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const firstUnreadRef = useRef(null);
    const hasScrolledInitially = useRef(false);
    const scrollPositionRef = useRef(0);

    const staffMembers = users.filter(u => u.id !== (user.id || user.uid));
    const uid = user.id || user.uid;

    const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

    const allMessages = useMemo(() => {
        return notifications
            .filter(n => n.type === 'MEMO' && (
                n.fromUserId === uid ||
                n.toUserId === uid ||
                (Array.isArray(n.toUserIds) && n.toUserIds.includes(uid))
            ))
            .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    }, [notifications, uid]);

    const unreadMessages = useMemo(() =>
        allMessages.filter(n => n.fromUserId !== uid && (!n.readBy || !n.readBy[uid])),
        [allMessages, uid]
    );

    // Track scroll position
    const handleScroll = () => {
        if (!messagesContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

        if (isAtBottom) {
            setHasNewMessagesAbove(false);
        }
        scrollPositionRef.current = scrollTop;
    };

    // On FIRST load: scroll to first unread, or bottom if all read
    useEffect(() => {
        if (allMessages.length > 0 && !hasScrolledInitially.current) {
            hasScrolledInitially.current = true;
            setTimeout(() => {
                if (firstUnreadRef.current) {
                    firstUnreadRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else if (messagesEndRef.current) {
                    messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
                }
            }, 150);
        }
    }, [allMessages.length]);

    // Handle new messages arriving
    useEffect(() => {
        if (!hasScrolledInitially.current || allMessages.length === 0) return;

        const lastMsg = allMessages[allMessages.length - 1];
        const isFromMe = lastMsg.fromUserId === uid;

        if (messagesContainerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
            const isAtBottom = scrollHeight - scrollTop - clientHeight < 150;

            if (isFromMe || isAtBottom) {
                // Auto-scroll to bottom if I sent it or already at bottom
                setTimeout(() => {
                    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
            } else {
                // Someone else sent it and I'm scrolled up: show "New Messages" hint
                setHasNewMessagesAbove(true);
            }
        }
    }, [allMessages.length, uid]);

    // Mark unread messages as read only when visible or when user scrolls to bottom
    useEffect(() => {
        if (unreadMessages.length > 0) {
            // Batch process all unread messages in one request
            const msgIds = unreadMessages.map(m => m.id);
            markNotificationAsRead(msgIds, uid, user.name || 'Staff');
        }
    }, [unreadMessages.length, uid, user.name, markNotificationAsRead]);

    const handleReply = (msg) => {
        setSelectedRecipients([msg.fromUserId]);
        setReplyTo({
            id: msg.id,
            sender: msg.fromUserName,
            content: msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : '')
        });
        // Focus the editor
        document.querySelector('.chat-textarea')?.focus();
    };

    const cancelReply = () => setReplyTo(null);

    const toggleRecipient = (id) => {
        setSelectedRecipients(prev =>
            prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
        );
    };

    const selectAll = () => setSelectedRecipients(staffMembers.map(u => u.id || u.uid));
    const clearAll = () => setSelectedRecipients([]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!messageContent.trim()) return;
        if (selectedRecipients.length === 0) {
            alert('Please select at least one recipient.');
            return;
        }

        const contentToSend = messageContent;
        const replyToSend = replyTo;
        setMessageContent('');
        setReplyTo(null);

        addNotification({
            toUserIds: selectedRecipients,
            fromUserId: uid,
            fromUserName: user.name || 'Staff',
            fromUserRole: user.role || 'Staff',
            type: 'MEMO',
            subType: 'CHAT',
            subject: 'Quick Message',
            content: contentToSend,
            priority: 'Normal',
            replyTo: replyToSend,
            read: false,
            deliveredTo: selectedRecipients,
        }).then(() => {
            auditLogger.log(user, 'WRITE', 'MEMO', 'multiple', `Sent chat message to: ${recipientNames}`);
            setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        }).catch(err => {
            console.error('Message send error:', err);
        });

        const recipientNames = staffMembers
            .filter(u => selectedRecipients.includes(u.id || u.uid))
            .map(u => u.name).join(', ');
    };

    const handleReaction = (msgId, emoji) => {
        toggleReaction(msgId, uid, emoji);
        setShowReactionPicker(null);
    };

    // Find index of first unread received message for divider
    // We'll use a "New Messages" demarcation line that appears once
    const firstUnreadIdx = useMemo(() =>
        allMessages.findIndex(m => m.fromUserId !== uid && (!m.readBy || !m.readBy[uid])),
        [allMessages, uid]
    );

    return (
        <div className="page-container memo-page chat-layout">
            <div className="page-header-flex" style={{ marginBottom: '0.5rem' }}>
                <div>
                    <h2>Internal Communication</h2>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {users.filter(u => u.isOnline && (u.id || u.uid) !== uid).length > 0 && (
                        <div className="online-presence-banner">
                            <span className="pulse-dot"></span>
                            <span className="presence-label">Online:</span>
                            <div className="online-names">
                                {users.filter(u => u.isOnline && (u.id || u.uid) !== uid).map(u => (
                                    <span key={u.id} className="online-user-tag">
                                        {u.name}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="chat-container">
                {/* Scroll to bottom button */}
                {hasNewMessagesAbove && (
                    <button className="jump-to-bottom" onClick={() => {
                        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                        setHasNewMessagesAbove(false);
                    }}>
                        <Check size={14} /> New Messages Below ↓
                    </button>
                )}

                {/* Recipient selector */}
                <div className="chat-recipients">
                    <div className="recipients-header">
                        <label>
                            <User size={14} /> Send To: {selectedRecipients.length === staffMembers.length && staffMembers.length > 0 ? 'All Members' : `${selectedRecipients.length} selected`}
                        </label>
                        <div className="recipients-actions">
                            <button type="button" onClick={selectAll}>Select All</button>
                            <button type="button" className="secondary" onClick={clearAll}>Clear</button>
                        </div>
                    </div>
                    <div className="recipients-track">
                        {staffMembers.length === 0 ? (
                            <p className="no-staff">No other active staff found.</p>
                        ) : staffMembers.map(u => {
                            const uId = u.id || u.uid;
                            const isSelected = selectedRecipients.includes(uId);
                            return (
                                <div
                                    key={uId}
                                    onClick={() => toggleRecipient(uId)}
                                    className={`recipient-pill ${isSelected ? 'selected' : ''}`}
                                >
                                    {u.isOnline && <span className="online-dot-memo"></span>}
                                    {isSelected && <Check size={12} />}
                                    <span>{u.name}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Messages area */}
                <div className="chat-messages" ref={messagesContainerRef} onScroll={handleScroll}>
                    {allMessages.length === 0 ? (
                        <div className="chat-empty-state">
                            <MessageSquare size={48} />
                            <p>Send a secure memo to the clinical team.</p>
                            <span className="small-text">Messages are end-to-end visible to staff.</span>
                        </div>
                    ) : (
                        <div className="message-list-inner">
                            {allMessages.map((msg, idx) => {
                                const isSent = msg.fromUserId === uid;
                                const isFirstUnread = idx === firstUnreadIdx;
                                const hasReactions = msg.reactions && Object.keys(msg.reactions).some(k => msg.reactions[k].length > 0);

                                return (
                                    <React.Fragment key={msg.id}>
                                        {isFirstUnread && (
                                            <div ref={firstUnreadRef} className="unread-divider">
                                                <span>New Messages</span>
                                            </div>
                                        )}
                                        <div className={`chat-bubble-wrapper ${isSent ? 'sent' : 'received'}`}>
                                            <div className="chat-bubble">
                                                {!isSent && (
                                                    <div className="chat-bubble-sender">
                                                        <div className="sender-name-row">
                                                            <strong>{msg.fromUserName}</strong>
                                                            {users.find(u => (u.id || u.uid) === msg.fromUserId)?.isOnline &&
                                                                <span className="online-dot-inline"></span>}
                                                        </div>
                                                        {msg.fromUserRole && <span className="sender-role">({msg.fromUserRole})</span>}
                                                    </div>
                                                )}

                                                {msg.replyTo && (
                                                    <div className="chat-reply-embed" onClick={() => {
                                                        const el = document.getElementById(`msg-${msg.replyTo.id}`);
                                                        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                        el?.classList.add('highlight-flash');
                                                        setTimeout(() => el?.classList.remove('highlight-flash'), 1000);
                                                    }}>
                                                        <div className="reply-sender">{msg.replyTo.sender}</div>
                                                        <div className="reply-text">{msg.replyTo.content}</div>
                                                    </div>
                                                )}

                                                <div className="chat-bubble-content" id={`msg-${msg.id}`}>
                                                    {msg.content.split(/(@\w+)/g).map((part, i) =>
                                                        part.startsWith('@')
                                                            ? <span key={i} className="memo-mention">{part}</span>
                                                            : part
                                                    )}
                                                </div>

                                                {/* Reaction Display */}
                                                {hasReactions && (
                                                    <div className="message-reactions">
                                                        {Object.keys(msg.reactions).map(emoji => {
                                                            const usersReactedIds = msg.reactions[emoji];
                                                            if (!usersReactedIds || usersReactedIds.length === 0) return null;

                                                            const userNamesTitle = usersReactedIds.map(id => {
                                                                const u = users.find(usr => (usr.id || usr.uid) === id);
                                                                return u ? u.name : 'User';
                                                            }).join(', ');

                                                            return (
                                                                <span
                                                                    key={emoji}
                                                                    className={`reaction-pill ${usersReactedIds.includes(uid) ? 'mine' : ''}`}
                                                                    onClick={() => handleReaction(msg.id, emoji)}
                                                                    title={`Reacted by: ${userNamesTitle}`}
                                                                >
                                                                    {emoji} <span>{usersReactedIds.length}</span>
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                <div className="chat-bubble-meta">
                                                    <span className="chat-time">
                                                        {msg.createdAt
                                                            ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                            : '...'}
                                                    </span>
                                                    {isSent && (
                                                        <div className="chat-ticks" onClick={() => setShowReaders(showReaders === msg.id ? null : msg.id)}>
                                                            {msg.readBy && Object.keys(msg.readBy).length > 0
                                                                ? <span className="ticks-seen">✓✓</span>
                                                                : <span className="ticks-delivered">✓✓</span>
                                                            }
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="chat-actions-overlay">
                                                    <button className="icon-action" onClick={(e) => {
                                                        e.stopPropagation();
                                                        setShowReactionPicker(showReactionPicker === msg.id ? null : msg.id);
                                                    }}>😊</button>
                                                    <button className="icon-action" onClick={() => handleReply(msg)}>↩</button>
                                                </div>

                                                {/* WhatsApp-style Reaction Picker */}
                                                {showReactionPicker === msg.id && (
                                                    <div className="reaction-picker-v2">
                                                        {QUICK_REACTIONS.map(emoji => (
                                                            <button
                                                                key={emoji}
                                                                onClick={() => handleReaction(msg.id, emoji)}
                                                                className={msg.reactions?.[emoji]?.includes(uid) ? 'active' : ''}
                                                            >
                                                                {emoji}
                                                            </button>
                                                        ))}
                                                        <button className="more-btn" onClick={() => {
                                                            const customEmoji = prompt("Enter an emoji:");
                                                            if (customEmoji) handleReaction(msg.id, customEmoji);
                                                        }}>+</button>
                                                    </div>
                                                )}
                                            </div>

                                            {isSent && showReaders === msg.id && (
                                                <div className="chat-readers-info">
                                                    <strong>Read by:</strong>
                                                    {!msg.readBy || Object.keys(msg.readBy).length === 0 ? (
                                                        <div className="reader-placeholder">Delivered</div>
                                                    ) : (
                                                        <ul className="readers-list">
                                                            {Object.keys(msg.readBy).map(readId => {
                                                                const u = users.find(usr => (usr.id || usr.uid) === readId);
                                                                const readTime = msg.readBy[readId].timestamp ? new Date(msg.readBy[readId].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                                                                return <li key={readId}>✓ {u?.name || 'Staff'} <span className="read-time-tag">{readTime}</span></li>;
                                                            })}
                                                        </ul>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input area */}
                <div className="chat-input-area">
                    {replyTo && (
                        <div className="chat-reply-preview">
                            <div className="quote-bar"></div>
                            <div className="quote-content">
                                <span className="quote-sender">Replying to {replyTo.sender}</span>
                                <p className="quote-text">{replyTo.content}</p>
                            </div>
                            <button type="button" className="quote-close" onClick={cancelReply}>&times;</button>
                        </div>
                    )}
                    <form onSubmit={handleSubmit} className="chat-input-row">
                        <textarea
                            className="chat-textarea"
                            placeholder={selectedRecipients.length === 0 ? 'Select members to message...' : 'Message team...'}
                            value={messageContent}
                            onChange={e => setMessageContent(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit(e);
                                }
                            }}
                            rows={1}
                            disabled={selectedRecipients.length === 0}
                        />
                        <button
                            type="submit"
                            className="chat-send-btn"
                            disabled={selectedRecipients.length === 0 || !messageContent.trim()}
                        >
                            <Send size={18} />
                        </button>
                    </form>
                </div>
            </div>

            <style>{`
                .chat-layout { 
                    height: calc(100vh - 4rem); 
                    display: flex; 
                    flex-direction: column; 
                    padding: 0 0.5rem;
                    overflow-x: hidden;
                }
                .memo-page .page-header-flex { 
                    margin-bottom: 0.25rem !important; 
                    padding: 0.5rem 0.5rem 0 0.5rem;
                    flex-wrap: wrap;
                }
                .memo-page .page-header-flex h2 { font-size: 1.2rem; margin: 0; }
                .memo-page .page-header-flex p { font-size: 0.8rem; margin: 0; }

                .chat-container {
                    background: var(--card-bg, #fff);
                    border: 1px solid var(--border-color, #e2e8f0);
                    border-radius: 12px;
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                    overflow: hidden;
                    position: relative;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.12);
                    max-width: 100%;
                    margin: 0 auto;
                    width: 100%;
                }
                .jump-to-bottom {
                    position: absolute;
                    bottom: 110px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #2563eb;
                    color: white;
                    border: none;
                    padding: 10px 24px;
                    border-radius: 30px;
                    font-size: 0.9rem;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    box-shadow: 0 4px 15px rgba(37, 99, 235, 0.4);
                    z-index: 10;
                    cursor: pointer;
                }

                .chat-recipients { border-bottom: 1px solid var(--border-color); padding: 8px 15px; background: var(--background-color); }
                .presence-label { font-size: 0.75rem; font-weight: 700; color: #64748b; margin-right: 8px; }
                .online-names { display: flex; gap: 8px; flex-wrap: wrap; }
                .online-user-tag { background: #f0fdf4; color: #166534; font-size: 0.7rem; padding: 2px 10px; border-radius: 20px; font-weight: 700; border: 1px solid #bbf7d0; display: flex; align-items: center; gap: 4px; }
                .online-user-tag::before { content: ""; width: 6px; height: 6px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 4px #22c55e; }
                
                .pulse-dot { width: 10px; height: 10px; background: #22c55e; border-radius: 50%; position: relative; }
                .pulse-dot::after { content: ""; position: absolute; width: 100%; height: 100%; top: 0; left: 0; background: #22c55e; border-radius: 50%; animation: pulse-presence 2s infinite; }
                @keyframes pulse-presence {
                    0% { transform: scale(1); opacity: 0.8; }
                    100% { transform: scale(3); opacity: 0; }
                }

                .chat-textarea {
                    width: 100%;
                    min-height: 45px;
                    max-height: 150px;
                    border: none;
                    background: transparent;
                    padding: 8px 0;
                    resize: none;
                    font-size: 0.95rem;
                    line-height: 1.5;
                    color: #1e293b;
                }
                .chat-textarea:focus { outline: none; }
                
                .text-xs { font-size: 0.7rem; }

                .recipients-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
                .recipients-header label { font-size: 0.9rem; font-weight: 600; display: flex; align-items: center; gap: 8px; color: var(--text-primary); }
                .recipients-actions button { background: none; border: none; color: #2563eb; font-size: 0.85rem; cursor: pointer; margin-left: 10px; }
                .recipients-track { display: flex; flex-wrap: wrap; gap: 8px; max-height: 60px; overflow-y: auto; padding: 2px 0; }
                .recipient-pill { padding: 4px 12px; border: 1px solid var(--border-color); border-radius: 15px; font-size: 0.8rem; cursor: pointer; background: var(--card-bg); display: flex; align-items: center; gap: 6px; transition: all 0.2s; }
                .recipient-pill.selected { background: #6366f1; color: white; border-color: #6366f1; }
                
                .chat-messages { 
                    flex: 1; 
                    overflow-y: auto; 
                    overflow-x: hidden; 
                    background-color: #efeae2; 
                    background-image: url("https://www.transparenttextures.com/patterns/cubes.png"); 
                    padding: 20px 15px; 
                    display: flex; 
                    flex-direction: column; 
                }
                html.dark .chat-messages { background-color: #0b141a; background-image: none; }
                
                .message-list-inner { display: flex; flex-direction: column; gap: 8px; }
                
                .unread-divider { display: flex; align-items: center; justify-content: center; margin: 30px 0; color: #128c7e; text-transform: uppercase; font-size: 0.8rem; font-weight: bold; letter-spacing: 1px; }
                .unread-divider::before, .unread-divider::after { content: ''; flex: 1; height: 1px; background: rgba(18, 140, 126, 0.3); margin: 0 30px; }
                .unread-divider span { background: #dcf8c6; padding: 6px 16px; border-radius: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }

                .chat-bubble-wrapper { display: flex; flex-direction: column; max-width: 75%; margin-bottom: 6px; }
                .chat-bubble-wrapper.sent { align-self: flex-end; }
                .chat-bubble-wrapper.received { align-self: flex-start; }
                
                .chat-bubble { 
                    padding: 14px 20px; 
                    border-radius: 14px; 
                    position: relative; 
                    box-shadow: 0 2px 2px rgba(0,0,0,0.1);
                    min-width: 150px;
                    margin-bottom: 8px; /* Room for absolute reactions */
                }
                .sent .chat-bubble { background: #dcf8c6; border-top-right-radius: 0; }
                .received .chat-bubble { background: #fff; border-top-left-radius: 0; }
                html.dark .sent .chat-bubble { background: #005c4b; color: #e9edef; }
                html.dark .received .chat-bubble { background: #202c33; color: #e9edef; }

                .chat-bubble-sender { margin-bottom: 8px; }
                .sender-name-row { display: flex; align-items: center; gap: 8px; color: #128c7e; font-size: 0.95rem; }
                html.dark .sender-name-row { color: #53bdeb; }
                .sender-role { font-size: 0.8rem; color: #888; }

                .chat-reply-embed { 
                    background: rgba(0,0,0,0.05); border-left: 6px solid #128c7e; padding: 10px 15px; 
                    border-radius: 10px; margin-bottom: 12px; cursor: pointer; font-size: 0.95rem;
                }
                .reply-sender { font-weight: bold; color: #128c7e; margin-bottom: 4px; }
                .reply-text { color: #555; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                html.dark .reply-text { color: #b1b3b5; }

                .chat-bubble-content { font-size: 1.15rem; line-height: 1.6; margin-bottom: 20px; word-break: break-word; }
                
                .message-reactions { 
                    position: absolute; 
                    bottom: -12px; 
                    right: 15px; 
                    display: flex; 
                    flex-wrap: wrap; 
                    gap: 6px; 
                    z-index: 5;
                }
                .reaction-pill { 
                    background: white; border: 1px solid #d1d7db; border-radius: 16px; 
                    padding: 3px 8px; font-size: 0.95rem; cursor: pointer; display: flex; align-items: center; gap: 4px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .reaction-pill.mine { background: #e8f5e9; border-color: #4caf50; }
                html.dark .reaction-pill { background: #374045; border-color: #2a3942; }

                .chat-bubble-meta { display: flex; justify-content: flex-end; align-items: center; gap: 8px; font-size: 0.8rem; color: #667781; }
                .chat-ticks { font-weight: bold; font-size: 1rem; }
                .ticks-seen { color: #34b7f1; }

                .chat-actions-overlay { 
                    position: absolute; right: 10px; top: -35px; 
                    display: flex; flex-direction: row; gap: 8px; opacity: 0; transition: opacity 0.2s;
                    background: rgba(255, 255, 255, 0.9);
                    padding: 5px 10px;
                    border-radius: 20px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    backdrop-filter: blur(4px);
                    border: 1px solid var(--border-color);
                }
                .chat-bubble:hover .chat-actions-overlay { opacity: 1; }
                .icon-action { 
                    background: white; border: 1px solid #ddd; border-radius: 50%; width: 36px; height: 36px; 
                    display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 1.1rem;
                    box-shadow: 0 3px 6px rgba(0,0,0,0.1);
                }
                html.dark .icon-action { background: #202c33; border-color: #374045; }

                .reaction-picker-v2 {
                    position: absolute; top: -60px; left: 0; background: white; border-radius: 35px;
                    padding: 10px 20px; display: flex; gap: 15px; box-shadow: 0 5px 30px rgba(0,0,0,0.2);
                    z-index: 100;
                }
                html.dark .reaction-picker-v2 { background: #202c33; }
                .reaction-picker-v2 button { background: none; border: none; font-size: 1.8rem; cursor: pointer; transition: transform 0.1s; }
                .reaction-picker-v2 button:hover { transform: scale(1.4); }
                .reaction-picker-v2 .more-btn { font-size: 1.2rem; color: #667; font-weight: bold; width: 40px; height: 40px; border-radius: 50%; background: #f0f2f5; display: flex; align-items: center; justify-content: center; }

                .chat-input-area { background: #f0f2f5; padding: 15px 30px 25px 30px; border-top: 1px solid #d1d7db; }
                html.dark .chat-input-area { background: #202c33; border-color: #374045; }
                .chat-input-row { display: flex; align-items: flex-end; gap: 15px; max-width: 1200px; margin: 0 auto; }
                .chat-textarea { 
                    flex: 1; background: white; border-radius: 30px; padding: 15px 25px; border: 1px solid transparent; 
                    resize: none; outline: none; font-size: 1.1rem; max-height: 150px; line-height: 1.5;
                }
                html.dark .chat-textarea { background: #2a3942; color: #e9edef; }
                .chat-send-btn { 
                    background: #128c7e; color: white; border: none; width: 60px; height: 60px; 
                    border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer;
                }
                
                .chat-empty-state {
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    height: 100%; color: #667781; gap: 1rem; opacity: 0.7;
                }
                .chat-empty-state p { font-size: 1.4rem; font-weight: 500; }
                .small-text { font-size: 1rem; }
                .readers-list li { display: flex; justify-content: space-between; align-items: center; padding: 2px 0; }
                .read-time-tag { font-size: 0.75rem; color: #888; font-weight: normal; margin-left: 10px; }
            `}</style>
        </div>
    );
};

export default Memo;
