// View toggle component
const ViewToggle = ({ viewMode, setViewMode }) => {
  return (
    <div className="view-toggle-container d-flex flex-column justify-content-center my-3 col-10 col-md-6 col-lg-3 mx-auto">
      <div className="btn-group view-toggle" role="group" aria-label="View Toggle">
        <button
          type="button"
          className={`btn btn-outline-light ${viewMode === 'daily' ? 'active' : ''}`}
          aria-label="Daily forecast"
          onClick={() => setViewMode('daily')}
        >
          Daily
        </button>
        <button
          type="button"
          className={`btn btn-outline-light ${viewMode === 'hourly' ? 'active' : ''}`}
          aria-label="Hourly forecast"
          onClick={() => setViewMode('hourly')}
        >
          Hourly
        </button>
      </div>
    </div>
  );
};

export default ViewToggle;
