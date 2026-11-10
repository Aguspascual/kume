package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/aguspascual/buscapolo/backend/internal/store"
)

type collectionResponse struct {
	Collection string          `json:"collection"`
	Revision   int64           `json:"revision"`
	Data       json.RawMessage `json:"data"`
	UpdatedAt  *string         `json:"updated_at,omitempty"`
}

func (a *API) getData(w http.ResponseWriter, r *http.Request) {
	collection := r.PathValue("collection")
	if !store.SupportedCollection(collection) {
		writeError(w, http.StatusNotFound, "collection_not_found", "La colección no existe.")
		return
	}
	user := r.Context().Value(userContextKey{}).(store.User)
	record, err := a.store.GetData(r.Context(), user.ID, collection)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "No se pudieron cargar los datos.")
		return
	}
	setETag(w, record.Revision)
	response := collectionResponse{
		Collection: collection,
		Revision:   record.Revision,
		Data:       json.RawMessage(record.Value),
	}
	if !record.UpdatedAt.IsZero() {
		updatedAt := record.UpdatedAt.UTC().Format(time.RFC3339Nano)
		response.UpdatedAt = &updatedAt
	}
	writeJSON(w, http.StatusOK, response)
}

func (a *API) putData(w http.ResponseWriter, r *http.Request) {
	collection := r.PathValue("collection")
	if !store.SupportedCollection(collection) {
		writeError(w, http.StatusNotFound, "collection_not_found", "La colección no existe.")
		return
	}
	revision, err := parseRevision(r.Header.Get("If-Match"))
	if err != nil {
		writeError(w, http.StatusPreconditionRequired, "revision_required", "Enviá el ETag recibido al consultar la colección.")
		return
	}

	var value json.RawMessage
	if err := decodeJSON(w, r, &value); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "El cuerpo debe ser un arreglo JSON válido.")
		return
	}
	value = bytes.TrimSpace(value)
	if len(value) == 0 || value[0] != '[' || !json.Valid(value) {
		writeError(w, http.StatusBadRequest, "invalid_collection_data", "La colección debe ser un arreglo JSON.")
		return
	}
	var items []json.RawMessage
	if err := json.Unmarshal(value, &items); err != nil || items == nil {
		writeError(w, http.StatusBadRequest, "invalid_collection_data", "La colección debe ser un arreglo JSON.")
		return
	}
	value = bytes.TrimSpace(value)

	user := r.Context().Value(userContextKey{}).(store.User)
	record, err := a.store.PutData(r.Context(), user.ID, collection, revision, value)
	if errors.Is(err, store.ErrRevisionConflict) {
		writeError(w, http.StatusConflict, "revision_conflict", "La colección cambió en otro dispositivo. Volvé a cargarla antes de guardar.")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "No se pudieron guardar los datos.")
		return
	}
	userID := user.ID
	a.recordActivity(r, &userID, "data", "Colección actualizada", "Colección: "+collection, "success")
	setETag(w, record.Revision)
	updatedAt := record.UpdatedAt.UTC().Format(time.RFC3339Nano)
	writeJSON(w, http.StatusOK, collectionResponse{
		Collection: collection,
		Revision:   record.Revision,
		Data:       json.RawMessage(record.Value),
		UpdatedAt:  &updatedAt,
	})
}
