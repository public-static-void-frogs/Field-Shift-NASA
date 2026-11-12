import torch
import numpy as np
import json
import os
from model import TempCNN

class CropPredictor:
    def __init__(self, model_path='weights/tempcnn_best.pth', classes_path='../../data/classes.json', energy_threshold=1.1225):
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        
        with open(classes_path, 'r', encoding='utf-8') as f:
            self.classes_dict = json.load(f)
        
        self.num_model_classes = 4 
        self.energy_threshold = energy_threshold
        
        self.other_class_idx = 4
        
        self.model = TempCNN(input_channels=5, num_classes=self.num_model_classes).to(self.device)
        
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Weights file not found: {model_path}")
            
        self.model.load_state_dict(torch.load(model_path, map_location=self.device, weights_only=True))
        self.model.eval()

    def predict(self, field_data):
        data = field_data.copy()

        if data.shape == (16, 5):
            data = np.transpose(data, (1, 0))
            
        if len(data.shape) == 2:
            data = np.expand_dims(data, axis=0)

        data[:, 3, :] = (data[:, 3, :] - (-30.0)) / (5.0 - (-30.0))
        data[:, 4, :] = (data[:, 4, :] - (-35.0)) / (0.0 - (-35.0))

        tensor_data = torch.tensor(data, dtype=torch.float32).to(self.device)

        with torch.no_grad():
            logits = self.model(tensor_data)
            energy_score = torch.logsumexp(logits, dim=1)[0].item()
            probabilities = torch.nn.functional.softmax(logits, dim=1)[0]
            predicted_idx = torch.argmax(logits, dim=1).item()


        probs_dict = {self.classes_dict[str(i)]["name"]: float(prob) for i, prob in enumerate(probabilities)}
        probs_dict["energy_score"] = float(energy_score)

        if energy_score < self.energy_threshold:
            predicted_class_id = self.other_class_idx
        else:
            predicted_class_id = predicted_idx

        return predicted_class_id, probs_dict