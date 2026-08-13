import './loader.scss';

export const Loader = () => {
    return (
        <div className="loader">
            <div className="loader__orbit">
                <div className="loader__ring loader__ring--outer" />
                <div className="loader__ring">
                    <div className="loader__planet" />
                </div>
                <div className="loader__sun" />
            </div>
            <div className="loader__text">Loading solar system</div>
        </div>
    );
};
