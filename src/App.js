import React, { useEffect, useState, useRef , useCallback} from 'react';
import { io } from 'socket.io-client';
import Picker from 'emoji-picker-react';

const ChatRoom = () => {
  const [roomName, setRoomName] = useState('');
  const [userName, setUserName] = useState('');
  const [message, setMessage] = useState('');
  const [receivedMessages, setReceivedMessages] = useState([]);
  const [socket, setSocket] = useState(null);
  const [socketId, setSocketId] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [typingUsers, setTypingUsers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const messageListRef = useRef(null);

  const SERVER_URL = "http://localhost:9090";

  const joinRoom = () => {
    const token = localStorage.getItem('userToken') || '';
    const newSocket = io(SERVER_URL, {
      query: { room: roomName, token: token, username: userName },
      withCredentials: true,
      transports: ['websocket'],
      reconnectionAttempts: 1
    });

    newSocket.on('connect', () => {
      console.log('Connected: for socket ID ' + newSocket.id);
      setSocketId(newSocket.id);
    });


    newSocket.on('get_message', (message) => {
      console.log('Received message:', message);
      setReceivedMessages((prevReceivedMessages) => {
        const messageExists = prevReceivedMessages.some(msg => msg.id === message.id);
        if (messageExists) {
          // Update existing message
          return prevReceivedMessages.map(msg => msg.id === message.id ? message : msg);
        } else {
          // Add new message
          return [...prevReceivedMessages, message];
        }
      });
      scrollToBottom();
    });



    newSocket.on('chat_history', (history) => {
      setReceivedMessages(history);
      scrollToBottom();
    });

    newSocket.on('assign_token', (token) => {
      localStorage.setItem('userToken', token);
      console.log('Received new token:', token);
    });

    newSocket.on('typing_status', (data) => {
      console.log('Typing status received:', data);
      setTypingUsers((prevTypingUsers) => {
        const userIndex = prevTypingUsers.findIndex(user => user.sender === data.sender);
        if (data.typing) {
          if (userIndex === -1) {
            console.log('Adding user to typing users:', data.sender);
            return [...prevTypingUsers, data];
          } else {
            console.log('Updating typing status for user:', data.sender);
            const updatedUsers = [...prevTypingUsers];
            updatedUsers[userIndex] = data;
            return updatedUsers;
          }
        } else {
          if (userIndex !== -1) {
            console.log('Removing user from typing users:', data.sender);
            return prevTypingUsers.filter(user => user.sender !== data.sender);
          }
        }
        return prevTypingUsers;
      });

    });

    newSocket.on('user_status', (data) => {
      console.log('User status received:', data);
      setOnlineUsers((prevOnlineUsers) => {
        const userIndex = prevOnlineUsers.findIndex(user => user.username === data.username);
        if (userIndex === -1) {
          return [...prevOnlineUsers, data];
        } else {
          const updatedUsers = [...prevOnlineUsers];
          updatedUsers[userIndex] = data;
          return updatedUsers;
        }
      });

    });

        // New event listener for message status updates
        newSocket.on('message_status_updated', (updatedMessage) => {
          console.log('Message status updated:', updatedMessage);
          setReceivedMessages((prevReceivedMessages) => {
            return prevReceivedMessages.map(msg => msg.id === updatedMessage.id ? updatedMessage : msg);
          });
        });

    newSocket.on('connect_error', (error) => {
      console.error('Connection Error:', error.message);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
    });

    newSocket.on('error', (error) => {
      console.error('Socket Error:', error);
    });

    setSocket(newSocket);
  };

  const sendMessage = () => {
    const serverMessage = {
      id: new Date().toISOString(), // Generate a temporary ID for the message
      type: "CLIENT",
      text: message,
      room: roomName,
      sender: userName,
      mediaFile: selectedFile ? Array.from(new Uint8Array(selectedFile.data)) : null,
      mediaFileName: selectedFile ? selectedFile.fileName : null,
      mediaFileType: selectedFile ? selectedFile.fileType : null,
      status: "SENT" 
    };

    if (socket) {
      // Adding the sent message to the list of received messages with status "SENT"
      setReceivedMessages(prevMessages => [...prevMessages, serverMessage]);
      socket.emit('send_message', serverMessage, (ack) => {
        console.log('Message ACK:', ack);
        setMessage('');
        setSelectedFile(null);
        scrollToBottom();
        sendTypingStatus(false);
      });
    }
  };

  const handleEmojiClick = (emojiObject) => {
    const emoji = emojiObject?.emoji;
    if (emoji) {
      setMessage((prevMessage) => prevMessage + emoji);
    }
  };

  const handleFileChange = (event) => {
    const efile = event.target.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const buffer = new Uint8Array(reader.result);
      const file = {
        fileName: efile.name,
        fileType: efile.type,
        data: buffer
      };
      setSelectedFile(file);
    };
    reader.readAsArrayBuffer(efile);
  };

  const downloadFile = (file) => {
    const blob = new Blob([new Uint8Array(file.mediaFile)], { type: file.mediaFileType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.mediaFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const scrollToBottom = () => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  };

  const sendTypingStatus = useCallback((isTyping) => {
    if (socket) {
      console.log(`Sending typing status: ${isTyping}`);
      socket.emit('typing', { room: roomName, sender: userName,typing: isTyping });
    }
  }, [socket, roomName, userName]);

  useEffect(() => {
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [socket]);

  useEffect(() => {
    scrollToBottom();
  }, [receivedMessages]);

  useEffect(() => {
    const handleTyping = (event) => {
      sendTypingStatus(event.target.value.length > 0);
    };

    window.addEventListener('input', handleTyping);
    return () => {
      window.removeEventListener('input', handleTyping);
    };
  }, [sendTypingStatus]);

    // New useEffect to handle updating message status to "RECEIVED"
    useEffect(() => {
      if (socket) {
      receivedMessages.forEach((message) => {
        if (message.status === 'SENT' && message.sender !== userName) {
          socket.emit('update_message_status', { ...message, status: 'RECEIVED' });
        }
      });
    }
    }, [receivedMessages, socket, userName]);
  
    // New useEffect to handle updating message status to "READ"
    useEffect(() => {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible'  && socket) {
          receivedMessages.forEach((message) => {
            if (message.status === 'RECEIVED' && message.sender !== userName) {
              socket.emit('update_message_status', { ...message, status: 'READ' });
            }
          });
        }
      };
  
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }, [receivedMessages, socket, userName]);

  return (
    <div className="flex flex-col items-center p-4 h-screen bg-gray-100">
      <h1 className="text-3xl font-bold text-blue-500 mb-4">Chat Room</h1>
      {!socketId ? (
        <div className="flex flex-col items-center">
          <input
            type="text"
            placeholder="Enter username"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            className="p-2 border border-gray-300 rounded mb-4 w-80"
          />
          <input
            type="text"
            placeholder="Enter room name"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            className="p-2 border border-gray-300 rounded mb-4 w-80"
          />
          <button
            onClick={joinRoom}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-700"
          >
            Join
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center w-full max-w-md flex-grow">
          <div className="w-full mb-4">
            <div className="text-xl mb-2">Room: {roomName}</div>
            <div className="text-xl mb-4">Client ID: {socketId}</div>
          </div>
          <div className="w-full mb-4">
          <h2 className="text-2xl font-bold text-gray-700 mb-2">Online Users:</h2>
            <ul className="list-none p-0">
              {onlineUsers
                .filter(user => user.username !== userName) // Exclude current user
                .map((user, index) => (
                  <li key={index} className="text-sm text-gray-500">
                    {user.username}: {user.online ? 'Online' : 'Offline'}
                  </li>
              ))}
            </ul>
          </div>
          <div className="flex-grow w-full overflow-y-auto mb-4" ref={messageListRef} style={{ paddingBottom: '100px' }}>
            <h2 className="text-2xl font-bold text-gray-700 mb-2">Messages:</h2>
            <ul className="list-none p-0">
              {receivedMessages.map((msg, index) => (
                <li
                  key={index}
                  className={`p-2 mb-1 text-sm ${msg.sender === userName ? 'bg-green-200 self-end text-right' : 'bg-gray-200 self-start text-left'}`}
                  style={{ 
                    maxWidth: '70%', 
                    marginLeft: msg.sender === userName ? 'auto' : '0', 
                    marginRight: msg.sender === userName ? '0' : 'auto',
                    borderRadius: '20px',
                    padding: '10px 15px',
                    position: 'relative',
                    wordBreak: 'break-word'
                  }}
                >
                  {msg.text}
                  {msg.mediaFile && (
                    <div>
                      <p>File: {msg.mediaFileName} ({(msg.mediaFile.length / 1024).toFixed(2)} KB)</p>
                      <button
                        onClick={() => downloadFile(msg)}
                        className="px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-700"
                      >
                        Download
                      </button>
                    </div>
                  )}
                  {msg.sender === userName && (
                  <div className="text-xs text-gray-500 mt-1">
                    {msg.status === 'SENT' && <span>✔️</span>} {/* Indicating sent message */}
                    {msg.status === 'RECEIVED' && <span>✔️✔️</span>} {/* Indicating received message */}
                    {msg.status === 'READ' && <span style={{ color: 'blue' }}>✔️✔️</span>} {/* Indicating read message */}

                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="text-sm text-gray-500">
              {typingUsers
                .filter(user => user.sender !== userName) // Exclude current user
                .map((user, index) => (
                  <div key={index}>
                    {user.sender} is typing...
                  </div>
              ))}
            </div>
          </div>
         
          <div className="w-full flex items-center p-2 border-t border-gray-300 bg-white fixed bottom-0 left-0">
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="ml-2 px-2 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-700"
            >
              😀
            </button>
            {showEmojiPicker && (
              <div className="absolute bottom-16 left-0 z-10">
                <Picker onEmojiClick={(emojiObject) => handleEmojiClick(emojiObject)} />
              </div>
            )}
            <input
              type="file"
              accept=".jpg, .jpeg, .png, .gif, .pdf, .doc, .docx, .txt"
              onChange={handleFileChange}
              className="ml-2"
            />
            <input
              type="text"
              placeholder="Enter message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
              className="p-2 border border-gray-300 rounded w-full mx-2"
              onInput={() => sendTypingStatus(true)}
              onBlur={() => sendTypingStatus(false)}
            />
            <button
              onClick={sendMessage}
              className="px-2 py-1 bg-green-500 text-white rounded hover:bg-green-700"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatRoom;
