const modelPath = 'static/model/model_dynamic.onnx'; // Update with your model path

function setupSlider(sliderId) {
    const slider = document.getElementById(sliderId);
    const imgContainer = slider.parentElement;
    const imgAfter = imgContainer.querySelector('.img-after');

    let isDragging = false;

    const updateSliderPosition = (e) => {
        const { left, width } = imgContainer.getBoundingClientRect();
        let offsetX;

        if (e.touches) {
            offsetX = e.touches[0].clientX - left; // For touch devices
        } else {
            offsetX = e.clientX - left; // For mouse devices
        }

        offsetX = Math.max(0, Math.min(offsetX, width)); // Keep the slider within bounds

        slider.style.left = `${offsetX}px`;
        imgAfter.style.clipPath = `inset(0 ${width - offsetX}px 0 0)`; // Reveal the after image based on slider position
    };

    slider.addEventListener('mousedown', (e) => {
        isDragging = true;
        updateSliderPosition(e);
    });

    slider.addEventListener('touchstart', (e) => {
        isDragging = true;
        updateSliderPosition(e);
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            updateSliderPosition(e);
        }
    });

    document.addEventListener('touchmove', (e) => {
        if (isDragging) {
            updateSliderPosition(e);
        }
    });

    document.addEventListener('touchend', () => {
        isDragging = false;
    });
}

async function loadModel() {
    const session = await ort.InferenceSession.create(modelPath);
    return session;
}

function preprocessImage(image, originalWidth, originalHeight) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = originalWidth; // Change to your model's input size
    canvas.height = originalHeight; // Change to your model's input size
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = new Float32Array(3 * canvas.width * canvas.height);

    for (let i = 0; i < imageData.data.length; i += 4) {
        data[i / 4 * 3] = imageData.data[i] / 255; // Red
        data[i / 4 * 3 + 1] = imageData.data[i + 1] / 255; // Green
        data[i / 4 * 3 + 2] = imageData.data[i + 2] / 255; // Blue
    }
    return data;
}

// Convert the model output tensor to an ImageData object
function createImageFromTensor(outputData, width, height) {
    const imageData = new ImageData(width, height);
    k = 0;
    for (let i = 0; i < outputData.length; i++) {
        const value = Math.floor(outputData[i] * 255); // Assuming output values are in range [0, 1]
        imageData.data[k] = value;
        k++;
        if ((i + 1) % 3 === 0) {
            imageData.data[k] = 255;
            k++;
        }
    }

    return imageData;
}


async function runModel(session, image, originalWidth, originalHeight) {
    const inputTensor = new ort.Tensor('float32', preprocessImage(image, originalWidth, originalHeight), [1, 3, originalWidth, originalHeight]); // Change dimensions as necessary
    const sc = new Float32Array(1);
    sc[0] = 1.0;
    const scaleTensor = new ort.Tensor('float32', sc, [1]);
    const feeds = { input: inputTensor, scale: scaleTensor }; // Change 'input' to your model's input name
    const results = await session.run(feeds); // TODO large image error
    return results.output.data; // Change 'output' to your model's output name
}

// Display the output image
async function displayOutputImage(results, width, height) {
    const outputData = results; // Assuming output is already in the right format
    const imageData = createImageFromTensor(outputData, width, height);
    // const canvas = document.createElement('canvas');
    const canvas = document.getElementById('outputcanvas');
    const onlinediv = document.getElementById('online');

    const ctx = canvas.getContext('2d');
    canvas.width = width; // Change to your model's input size
    canvas.height = height; // Change to your model's input size
    ctx.putImageData(imageData, 0, 0);
    onlinediv.style.width = width;
    onlinediv.style.height = height;
}


document.getElementById('imageInput').addEventListener('change', function (event) {
    if(cameraOn){
        createAlert('Please stop the camera first');
        event.currentTarget.value = '';
        return;
    }
    const file = event.target.files[0];
    if (!file) {
        return;
    }
    preview.style.display = 'block';
    preview.src = URL.createObjectURL(file);
    preview.onload = function () {
        const canvas = document.getElementById('outputcanvas');
        const originalWidth = Math.round(preview.naturalWidth / 8) * 8;
        const originalHeight = Math.round(preview.naturalHeight / 8) * 8;
        canvas.width = originalWidth;
        canvas.height = originalHeight;
        const slider = document.getElementById('slider3');
        const viewWidth = window.innerWidth;
        const viewHeight = window.innerHeight;
        const displayWidth = preview.naturalWidth > viewWidth ? viewWidth : preview.naturalWidth;
        const displayHeight = preview.naturalHeight > viewHeight ? viewHeight : preview.naturalHeight;
        preview.style.width = `${displayWidth}px`;
        preview.style.height = `${displayHeight}px`;
        slider.style.left = `${displayWidth / 2}px`;
    };

});

document.getElementById('enhanceBtn').addEventListener('click', async function () {
    const session = await loadModel();
    // Based on the model's input size, you may need to resize the image to a multiple of 8

    // const originalWidth = Math.round(img.naturalWidth / 8) * 8;
    // const originalHeight = Math.round(img.naturalHeight / 8) * 8;
    const originalWidth = Math.round(preview.clientWidth / 8) * 8;
    const originalHeight = Math.round(preview.clientHeight / 8) * 8;
    const predictions = await runModel(session, preview, originalWidth, originalHeight);
    await displayOutputImage(predictions, originalWidth, originalHeight);
});

const cameraBtn = document.getElementById('cameraBtn');
const cameraStream = document.getElementById('cameraStream');
const preview = document.getElementById('preview');

let cameraOn = false;
let stream = null;

cameraBtn.addEventListener('click', async () => {
    const session = await loadModel();
    document.getElementById('imageInput').value = '';
    if (!cameraOn) {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
            cameraStream.srcObject = stream;
            cameraStream.play();
            // cameraStream.style.display = 'block';
            cameraBtn.innerHTML = '<i class="fas fa-stop-circle"></i>  Camera';
            cameraBtn.style.backgroundColor = '#7bdc04';
            cameraOn = true;
            preview.style.display = 'block';
            // Capture frame and set to preview image
            const captureFrame = () => {
                const canvas = document.createElement('canvas');
                canvas.width = cameraStream.videoWidth;
                canvas.height = cameraStream.videoHeight;
                const context = canvas.getContext('2d');
                context.drawImage(cameraStream, 0, 0, canvas.width, canvas.height);
                preview.src = canvas.toDataURL('image/webp');
            };
            preview.onload = async function () {
                const originalWidth = Math.round(preview.clientWidth / 8) * 8;
                const originalHeight = Math.round(preview.clientHeight / 8) * 8;
                const predictions = await runModel(session, preview, originalWidth, originalHeight);
                await displayOutputImage(predictions, originalWidth, originalHeight);
            };
            // Capture frame every 100ms
            captureInterval = setInterval(captureFrame, 100);
        } catch (error) {
            console.error('Error accessing camera: ', error);
        }
    } else {
        stream.getTracks()
            .forEach(track => track.stop())
        cameraStream.pause();
        cameraBtn.innerHTML = '<i class="fas fa-camera"></i>  Camera';
        cameraBtn.style.backgroundColor = '#ff0000e3';
        // Clear the frame capturing interval
        clearInterval(captureInterval);
        preview.onload = null;
        preview.src = '';
        cameraOn = false
        // cameraStream.style.display = 'none';
    }
});

function createAlert(message) {
    // Create a new div for the alert
    var alertDiv = document.createElement("div");
    alertDiv.className = "alert";
    
    // Add close button and custom alert message
    alertDiv.innerHTML = `
      <span class="closebtn" onclick="this.parentElement.style.display='none';">&times;</span> 
      <strong>Danger!</strong> ${message}
    `;
  
    // Append the new alert div to the alert container
    document.getElementById("alertContainer").appendChild(alertDiv);
  }

window.onload = function () {
    // Initialize both sliders
    setupSlider('slider1');
    setupSlider('slider2');
    setupSlider('slider3');
};