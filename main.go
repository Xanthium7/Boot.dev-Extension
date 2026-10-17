package main



type formatter interface {
	format() string
}

type plainText struct {
	message string
} 

func ( p plainText) format() string {
	return p.message
}

type bold struct {
	message string
}

func (b bold) format() string {
	return "**" + b.message + "**"
}

type code struct {
	message string
}

func (c code) format() string {
	return "`" + c.message + "`"
}


// Don't Touch below this line

func sendMessage(format formatter) string {
	return format.format() // Adjusted to call Format without an argument
}
