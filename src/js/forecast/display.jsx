export const formatters = {
    temperature: (temp) => `${temp}°C`,
    time: (timestamp) => new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
};

export const setBackgroundImage = (imageUrl) => {
    document.body.style.backgroundImage = `url('${imageUrl}')`;
}


export const LoadingIndicator = () => (
    <div className="weather-loading text-center p-5">
        <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
        </div>
        <p className="mt-3">Loading weather data...</p>
    </div>
);


export const ErrorMessage = ({ error }) => (
    <div className="weather-error alert alert-danger" role="alert">
        <h4 className="alert-heading">Weather Error</h4>
        <p>{error}</p>
    </div>
);
