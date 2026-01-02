const Toast = ({ message, type, onDismiss }) => {
  if (!message) return null;

  const baseClasses = "fixed top-5 right-5 p-4 rounded-md shadow-lg text-white transition-opacity duration-300 z-50";
  const typeClasses = {
    success: 'bg-green-500',
    error: 'bg-red-500',
  };

  return (
    <div className={`${baseClasses} ${typeClasses[type]}`}>
      <span>{message}</span>
      <button onClick={onDismiss} className="ml-4 font-bold">X</button>
    </div>
  );
};

export default Toast;