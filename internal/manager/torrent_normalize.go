package manager

import (
	"path/filepath"
	"regexp"
	"strings"
)

var torrentTitleRegexp = regexp.MustCompile(`([A-Za-z]+)[^A-Za-z0-9]*([0-9]+)`)

type torrentTitleMatch struct {
	prefix string
	number string
}

// parseTorrentTitleStrict returns a single (prefix, number) match extracted from the
// basename of the torrent file path. If there are zero or multiple matches, ok is false.
func parseTorrentTitleStrict(path string) (m torrentTitleMatch, ok bool) {
	base := filepath.Base(path)
	name := strings.TrimSuffix(base, filepath.Ext(base))

	matches := torrentTitleRegexp.FindAllStringSubmatch(name, -1)
	if len(matches) != 1 || len(matches[0]) != 3 {
		return torrentTitleMatch{}, false
	}

	return torrentTitleMatch{
		prefix: matches[0][1],
		number: matches[0][2],
	}, true
}

func formatTorrentTitle(prefix, number string) string {
	p := strings.ToUpper(prefix)
	n := number
	if len(n) >= 1 && len(n) <= 3 {
		n = strings.Repeat("0", 3-len(n)) + n
	}
	return p + "-" + n
}
